// Mæglervideoer hentes først, når man trykker på dem. Det holder forsiden hurtig.
export function initVideoer(rod = document) {
  rod.querySelectorAll('button.mk-video[data-video]').forEach((knap) => {
    if (knap.dataset.klar) return;
    knap.dataset.klar = '1';
    knap.addEventListener('click', () => {
      const boks = document.createElement('div');
      boks.className = 'mk-video';
      const v = document.createElement('video');
      v.src = knap.dataset.video;
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      boks.appendChild(v);
      knap.replaceWith(boks);
    });
  });
}
