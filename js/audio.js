// 音を出すか、消音にするか（起動のたびに、最初の画面で選ぶ）。ページを閉じるまでの間だけ有効
// BGM・効果音・ボイスを鳴らすところは、鳴らす前に soundOn() を見る
let on = true;
export const soundOn = () => on;
export const setSound = v => { on = !!v; };
