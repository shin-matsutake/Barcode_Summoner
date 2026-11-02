// データの読み込み。version.json の番号を ?v= に付けて、データ更新時に古い内容が残らないようにする。
// monsters.json / skills.json は { monsters:[...] } / { skills:[...] } の形でも、配列そのままでも読める。
export async function loadData() {
  const vres = await fetch('data/version.json?t=' + Date.now());
  if (!vres.ok) throw new Error('version.json を読み込めません');
  const version = (await vres.json()).version;
  const get = async file => {
    const res = await fetch(`data/${file}?v=${version}`);
    if (!res.ok) throw new Error(`${file} を読み込めません`);
    return res.json();
  };
  const [m, s] = await Promise.all([get('monsters.json'), get('skills.json')]);
  const monsters = Array.isArray(m) ? m : m.monsters;
  const skills = Array.isArray(s) ? s : s.skills;
  if (!monsters || !skills) throw new Error('データの形式が想定と違います');
  return { version, monsters, skills };
}
