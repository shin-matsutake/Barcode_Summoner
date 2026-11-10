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
  const [m, s, t, st] = await Promise.all([get('monsters.json'), get('skills.json'), get('tower.json').catch(() => ({ stages: [] })), get('story.json').catch(() => null)]);
  const monsters = Array.isArray(m) ? m : m.monsters;
  const skills = Array.isArray(s) ? s : s.skills;
  if (!monsters || !skills) throw new Error('データの形式が想定と違います');
  return { version, monsters, skills, tower: { stages: (t && t.stages) || [] }, story: { cast: (st && st.cast) || {}, acts: (st && st.acts) || [] } };
}
// ステージ番号から探す（ステージの数は決め打ちしない）
export const stageOf = (data, n) => data.tower.stages.find(x => x.stage === n) || null;
export const randomTeamIdx = stg => Math.floor(Math.random() * stg.teams.length);
