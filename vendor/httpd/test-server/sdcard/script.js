

function askServer() {

	var xhr = new XMLHttpRequest();
	xhr.open('get', '/xhr?aaa');
	xhr.send('null');
	xhr.onload = function() {
		var x = document.getElementById('ans');
		ans.innerHTML = 'ans:' + xhr.response + ' ' + ( new Date());
	}
	xhr.onerror = function() {
		console.log('error');
	}
	setTimeout(askServer, 1500);
}

window.onload = function() {
	askServer();
}
