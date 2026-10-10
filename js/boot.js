// 결과 링크(#r=)로 열면 첫 그림부터 결과 화면만 보이게 (처음 화면이 잠깐 보였다가 바뀌는 깜빡임·화면 밀림 방지)
if (/^#r=/.test(location.hash)) document.documentElement.classList.add('locked', 'boot-r');
