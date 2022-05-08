// =============================================================================
//                                  Configuration
// =============================================================================

let web3 = new Web3(Web3.givenProvider || "ws://localhost:8545");

var GENESIS = '0x0000000000000000000000000000000000000000000000000000000000000000';

// ABI for the contract from Remix IDE
var abi = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "creditor",
				"type": "address"
			},
			{
				"internalType": "uint32",
				"name": "amount",
				"type": "uint32"
			}
		],
		"name": "add_Trans",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getUsers",
		"outputs": [
			{
				"internalType": "address[]",
				"name": "",
				"type": "address[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "debtor",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "creditor",
				"type": "address"
			}
		],
		"name": "lookup",
		"outputs": [
			{
				"internalType": "uint32",
				"name": "ret",
				"type": "uint32"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
]; 

abiDecoder.addABI(abi);
// Change the contractAddress with the deployed contract address

var contractAddress = '0xD3dE0359367675533b4Ba7824c5dEBe8613e5693'; // FIXME: fill this in with your contract's address/hash
var BlockchainSplitWise = new web3.eth.Contract(abi, contractAddress);

var debtor2CreditorsMap = {};
var creditor2DebtorsMap = {};
var split_strategy = [];
var split_temp = [];
var users_global = [];

// =============================================================================
//                            Functions
// =============================================================================
async function getUsers() {
	users_global = await BlockchainSplitWise.methods.getUsers().call();
	return users_global;
}

async function downloadAll(){
	var users = await BlockchainSplitWise.methods.getUsers().call();
	users_global = users;
	// console.log(users_global);
	//Generate a blank dynamic graph to record transaction history
	var graph =  new Array(users.length);
	for(var i = 0;i < graph.length; i++){
   		graph[i] = new Array(users.length);
	}
	//The value of graph[m][n] means the amount that users_global[m] owes users_global[n]
	for(var m = 0; m < users.length; m++){
		for(var n = 0; n < users.length; n++){
			if(m == n){
				graph[m][n] = 0;
				continue;
			}
			var debtor = users[m];
			var creditor = users[n];
			var amount = await BlockchainSplitWise.methods.lookup(debtor, creditor).call();
			graph[m][n] = amount;
			if(amount == 0) continue;
			if(debtor2CreditorsMap[debtor] == null){
				var map = {};
				map[creditor] = amount;
				debtor2CreditorsMap[debtor] = map;
			}else{
				debtor2CreditorsMap[debtor][creditor] = amount;
			}
			if(creditor2DebtorsMap[creditor] == null){
				var map = {};
				map[debtor] = amount;
				creditor2DebtorsMap[creditor] = map;
			}else{
				creditor2DebtorsMap[creditor][debtor] = amount;
			}
		}
	}
	// console.log(graph)
	minCashFlow(graph)
}

// Return the index of minimum value in array
function getMin(array)
    {
	var minInd = 0;
	for (i = 1; i < users_global.length; i++)
		if (array[i] < array[minInd])
			minInd = i;
	return minInd;
    }

// Return the index of minimum value in array
function getMax(array)
    {
	var maxInd = 0;
	for (i = 1; i < users_global.length; i++)
		if (array[i] > array[maxInd])
			maxInd = i;
	return maxInd;
    }

// Return the index of minimum of 2 values
function find_min(x , y)
    {
	return (x < y) ? x: y;
    }

function minCashFlowRec(amount)
    {
	var mxCredit = getMax(amount), mxDebit = getMin(amount);

	// Recursion End Condition
	if (amount[mxCredit] == 0 && amount[mxDebit] == 0)
		return;

	// Find the minimum of two amounts
	var min = find_min(-amount[mxDebit], amount[mxCredit]);
	amount[mxCredit] -= min;
	amount[mxDebit] += min;

	// Add strategy to the temp
	split_temp += ("<i>" + users_global[mxDebit] + "</i>" + " should pay " + "<b>" + min + "</b>"
							+ " to " + "<i>" + users_global[mxCredit] + "</i>" + "<br>");
	// console.log("User " + users_global[mxDebit] + " should pay " + min
	// 						+ " to " + "User " + users_global[mxCredit]);

	//The recursion is garranteed to be terminated in this NP complete problem
	
	minCashFlowRec(amount);
    }

// Find the net amount of each users and stored in amount variable
function minCashFlow(graph)
{
	var amount=Array.from({length: users_global.length}, (_, i) => 0);
	split_temp = [];

	// Calculate the net amount
	for (m = 0; m < users_global.length; m++)
	for (n = 0; n < users_global.length; n++)
		amount[m] += (graph[n][m] - graph[m][n]);
	// console.log(users_global.length);
	// console.log(amount);
	if(users_global.length!=0) {
		minCashFlowRec(amount, split_temp);
		split_strategy = split_temp;
		console.log(split_strategy);
	}
}



// Calculate the total amount owed by the user specified by 'user'
async function getTotalOwed(user) {
	if(users_global == null || users_global.length == 0){
		await downloadAll();
	}

	var debtorMap = debtor2CreditorsMap[user];
	var creditorMap = creditor2DebtorsMap[user];
	var amount = 0.0;
	for(var key in debtorMap){
		amount += parseFloat(debtorMap[key]);
	}
	for(var key in creditorMap){
		amount -= parseFloat(creditorMap[key]);
		if(amount <= 0) {
			return 0;
		}
	}
	return amount;
}

// Return the last time this user has sent or received an IOU, in seconds since Jan. 1, 1970
async function getLastActive(user) {
	user = user.toLowerCase();
	var function_calls = await getAllFunctionCalls(contractAddress, "add_Trans");
	//function_calls.concat(await getAllFunctionCalls(contractAddress, "lookup"));
	var last_call = null;
	for(var i = 0; i < function_calls.length; i++){
		var call = function_calls[i];
		
		if(call["from"] == user){
			last_call = call;
		}
	}
	if(last_call){
		return last_call["t"];
	}
	return null;
}

// The person you owe money is defined as 'creditor'
// The amount you owe them is defined as 'amount'
async function add_Trans(creditor, amount) {
	BlockchainSplitWise.methods.add_Trans(creditor, parseInt(amount)).send({'from': web3.eth.defaultAccount, gas: 3141592});
	await downloadAll();
}

// This searches the block history for all calls to 'functionName' (string) on the 'addressOfContract' (string) contract
// It returns an array of objects, one for each call, containing the sender ('from'), arguments ('args'), and the timestamp ('t')
async function getAllFunctionCalls(addressOfContract, functionName) {
	var curBlock = await web3.eth.getBlockNumber();
	var function_calls = [];

	while (curBlock !== GENESIS) {
	  var block = await web3.eth.getBlock(curBlock, true);
	  var txns = block.transactions;
	  for (var j = 0; j < txns.length; j++) {
	  	var txn = txns[j];

	  	// check that destination of txn is our contract
		if(txn.to == null){continue;}
	  	if (txn.to.toLowerCase() === addressOfContract.toLowerCase()) {
	  		var func_call = abiDecoder.decodeMethod(txn.input);

			// check that the function getting called in this txn is 'functionName'
			if (func_call && func_call.name === functionName) {
				var time = await web3.eth.getBlock(curBlock);
				var args = func_call.params.map(function (x) {return x.value});
				function_calls.push({
					from: txn.from.toLowerCase(),
					args: args,
						t: time.timestamp
				})
	  		}
	  	}
	  }
	  curBlock = block.parentHash;
	}
	return function_calls;
}

// =============================================================================
//                                      UI
// =============================================================================

web3.eth.getAccounts().then((response)=> {
	web3.eth.defaultAccount = response[0];

	getTotalOwed(web3.eth.defaultAccount).then((response)=>{
		$("#total_owed").html("$"+response);

		var creditor_amount = ""
		var temp = debtor2CreditorsMap[web3.eth.defaultAccount]
		// console.log(web3.eth.defaultAccount)
		// console.log(temp)
		for (var key in temp) {
			creditor_amount += "<p>" + key + ": " + '<b>' + temp[key] + '</b>' + "</p>"
		}
		// for (var i = 0; i < length(temp); i++) {
		// 	creditor_amount += "<p>" + temp[0]
		// }
		$("#creditors").html(creditor_amount);
	});

	getLastActive(web3.eth.defaultAccount).then((response)=>{
		time = timeConverter(response)
		$("#last_active").html(time)
	});
});

// This code updates the 'My Account' UI with the results of your functions
$("#myaccount").change(function() {
	web3.eth.defaultAccount = $(this).val();

	var creditor_amount = ""
	var temp = debtor2CreditorsMap[web3.eth.defaultAccount]
	// console.log(web3.eth.defaultAccount)
	// console.log(temp)
	for (var key in temp) {
		creditor_amount += "<p>" + key + ": " + '<b>' + temp[key] + '</b>' + "</p>"
	}
	// for (var i = 0; i < length(temp); i++) {
	// 	creditor_amount += "<p>" + temp[0]
	// }
	$("#creditors").html(creditor_amount);

	getTotalOwed(web3.eth.defaultAccount).then((response)=>{
		$("#total_owed").html("$"+response);
	})

	getLastActive(web3.eth.defaultAccount).then((response)=>{
		time = timeConverter(response)
		$("#last_active").html(time)
	});
});

// Allows switching between accounts in 'My Account' and the 'fast-copy' in 'Address of person you owe
web3.eth.getAccounts().then((response)=>{
	var opts = response.map(function (a) { return '<option value="'+
			a.toLowerCase()+'">'+a.toLowerCase()+'</option>' });
	$(".account").html(opts);
	$(".wallet_addresses").html(response.map(function (a) { return '<li>'+a.toLowerCase()+'</li>' }));
});

// This code updates the 'Users' list in the UI with the results of your function
getUsers().then((response)=>{
	$("#all_users").html(response.map(function (u,i) { return "<li>"+u+"</li>" }));
});

// This runs the 'add_Trans' function when you click the button
// It passes the values from the two inputs above
$("#addiou").click(function() {
	web3.eth.defaultAccount = $("#myaccount").val(); //sets the default account
	add_Trans($("#creditor").val(), $("#amount").val()).then((response)=>{
			window.location.reload(true); // refreshes the page after add_Trans returns and the promise is unwrapped
		})
});

// This is a log function, provided if you want to display things to the page instead of the JavaScript console
// Pass in a discription of what you're printing, and then the object to print
function log(description, obj) {
	$("#log").html($("#log").html() + description + ": " + JSON.stringify(obj, null, 2) + "\n\n");
}


// acquire popup
var modal = document.getElementById('myModal');
var btn = document.getElementById("myBtn");
var span = document.querySelector('.close');
 
btn.onclick = function() {
    modal.style.display = "block";
	$("#history").html("<h1> Transaction Strategy </h1>" + split_strategy)
}
 
span.onclick = function() {
    modal.style.display = "none";
}
 
window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
}