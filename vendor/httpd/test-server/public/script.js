

window.onload = function() {
	var t = document.getElementById('time');
	setInterval(function() {
		t.innerHTML = '' + (new Date());
	}, 500);
}
