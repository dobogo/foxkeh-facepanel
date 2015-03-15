$('.icon-img').on('touchstart', function(event) {
  $(event.target).addClass('pulse');
});

$('.icon-img').on('touchend', function(event) {
  $(event.target).removeClass('pulse');
});
