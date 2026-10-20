// The judging loop for the story's key frames (after Dream Loop, github.com/achimala/dream-loop): capture every key frame,
// send each one to a fresh Codex judge (it never sees the code) with its target image and last round's verdict, collect
// the scores. One round:
//   node tools/judge.mjs r1 [--shots key-street,key-end] [--no-capture]
// Files: docs/judge/<round>/<shot>.jpg (frame), <shot>.md (verdict), scores.md (table); targets in docs/judge/targets/.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const round = args[0];
if (!round || round.startsWith('--')) { console.error('usage: node tools/judge.mjs <round> [--shots a,b] [--no-capture]'); process.exit(2); }
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const INTENT = {
  'key-shelf': '第一幕:机器人面朝店里,光停在货架上;镜头越过它的头、顺着光束推到货架前,像产品近景:纸箱上的电视和上层的电子管收音机。被光照到的家电回到从前(电视有画面、收音机刻度灯亮)。这是观众近看 Tripo 模型细节的画面,要经得住看。',
  'key-bench': '第一幕结尾:机器人看向自己工作台上修到一半的开盖收音机,光落在它上面,一阵杂音后它放出一支曲子。画面要让人看懂"这是它自己的收音机"。',
  'key-turn': '转身:街对面传来同一支曲子,机器人在凳子上转过身面朝门外。从门口看,整台机器人(Tripo 生成的主角)完整、清楚、有体积感,镜头亮着。',
  'key-street': '第二幕:从店里稍远处看,机器人整个坐在门口的凳子上背对我们,眼睛射出的光束穿过半开的卷帘门斜着落到对街的五金店;光照到的那家店回到九十年代的傍晚,其余是拆迁后的现在(卷帘门、"拆"字、碎砖)。对街是生成的照片,近处路面和店是三维。',
  'key-climax': '高潮:电量将尽,机器人最后看向放曲子的电器店。从店里它的左侧看:它的侧影在门口,眼睛射出的光束横穿马路落在电器店上,整条街一起亮回九十年代的傍晚,暖光照进门来;然后会熄灭。',
  'key-memory': '高潮里的反打:整条街亮回九十年代的那一刻,镜头切到机器人脸前(门口,稍偏左),街上的暖光照在它的镜头眼和锈壳上,像在回想。这是 Tripo 生成的主角模型的近景,要经得住看。',
  'key-end': '结尾:光已熄灭,街回到现在。从店里机器人的左侧看,它坐在门口,侧影朝着黑下来的拆迁街道,对街唯一一盏冷白路灯亮着;它身上只有门边夜色的一道冷光。',
};
const shots = (opt('shots') || Object.keys(INTENT).join(',')).split(',');
const outDir = path.join(root, 'docs/judge', round); mkdirSync(outDir, { recursive: true });
const rounds = existsSync(path.join(root, 'docs/judge')) ? readdirSync(path.join(root, 'docs/judge')).filter((d) => /^r\d+$/.test(d)).sort((a, b) => +a.slice(1) - +b.slice(1)) : [];
const prev = rounds.filter((r) => +r.slice(1) < +round.slice(1)).pop();

// 1. capture (fixed shots, deterministic) -> docs/judge/<round>/<shot>.jpg
if (!args.includes('--no-capture')) {
  execFileSync('node', [path.join(root, 'tools/shot.mjs'), ...shots, '--frames', '200', '--tag', round], { cwd: root, stdio: 'inherit', timeout: 580000 });
  for (const s of shots) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(root, `renders/${s}-${round}.png`), '-q:v', '3', path.join(outDir, `${s}.jpg`)]);
}

// 2. one fresh judge per frame
const team = (a) => execFileSync('python3', [path.join(process.env.HOME, '.local/opt/agent-team/team.py'), ...a], { cwd: root, encoding: 'utf8', timeout: 600000 });
const rel = (p) => path.relative(root, p);
const ids = [];
for (const s of shots) {
  const target = path.join(root, `docs/judge/targets/${s}.jpg`);
  const pShot = prev && path.join(root, `docs/judge/${prev}/${s}.jpg`), pVerdict = prev && path.join(root, `docs/judge/${prev}/${s}.md`);
  const task = `# 只读评审:关键画面 ${s},第 ${round} 轮(全新评委,请苛刻)

背景:新游戏 是一段 three.js WebGPU 网页实时体验,目的是**宣传 Tripo 生成的 3D 模型**,同时要打动人:拆迁区一间关了门的家电修理铺,黄昏,店里的旧物和小机器人都是 Tripo 生成的原始网格;机器人睁眼,光照到哪里哪里回到从前。

这个画面要传达的:${INTENT[s]}

看这些图(相对项目根目录):
- 当前画面:\`${rel(path.join(outDir, `${s}.jpg`))}\`
${existsSync(target) ? `- 目标画面(要逼近的"梦想版"游戏内截图):\`${rel(target)}\`` : '- 还没有目标图:按"顶级的网页实时 3D 作品、让人觉得 AI 加 Tripo 竟然能做到这种地步"的标准评判。'}
${pShot && existsSync(pShot) ? `- 上一轮的画面:\`${rel(pShot)}\`${existsSync(pVerdict) ? `;上一轮的评语:\`${rel(pVerdict)}\`` : ''}(保持评判一致,但退步了就该更低分)` : ''}

按这张评分表打分(可以给小数):
- **构图 0–3**:机位、画框、主体的位置和大小${existsSync(target) ? '是否和目标一致' : '是否把要传达的东西放在最好的位置'}。
- **光 0–3**:色调、曝光、阴影、对比、氛围、反光、辉光;整体不能过暗或过亮。
- **材质 0–3**:每个表面的纹理、粗糙度、透明、湿润是否可信;有没有发块、像塑料、过于光滑、发软融化、粘连、贴图糊。
- **细节 0–1**:逐处比对,任何小瑕疵都算(悬空、穿插、接缝、锯齿、闪烁、露底)。

要求:列出**全部差距**,每条都要写清是画面哪个位置、哪里让它显得不对、具体怎么改,能让另一个人照着改完就涨分("这里看着假"不算)。需要换机位、重做灯光或重新生成模型就直说。

交回格式:第一行必须是 \`总分 X/10(构图 a/3,光 b/3,材质 c/3,细节 d/1)\`,然后是按影响排序的差距清单。中文,900 字以内,直接在回复里。

权限:只读,不联网,不调用付费生成,不启动浏览器、Blender、Vite 或长时间进程,不改文件。
`;
  const tf = path.join(root, `.agent-tasks/judge-${round}-${s}.md`); writeFileSync(tf, task);
  const id = `judge-${round}-${s}`; ids.push([s, id]);
  console.log(team(['post', '--project', root, '--from', 'claude', '--to', 'codex', '--title', `评审 ${s} ${round}`, '--task-file', tf, '--id', id]).trim().split('\n').pop());
}

// 3. collect: verdicts + score table (with last round's for comparison)
team(['wait', '--project', root, '--id', ids.map((x) => x[1]).join(',')]);
const rows = [];
const score = (txt) => { const m = txt && txt.match(/总分\s*([\d.]+)\s*\/\s*10[^\n]*/); return m ? { total: +m[1], line: m[0].trim() } : null; };
for (const [s, id] of ids) {
  const res = path.join(root, `.agent-tasks/${id}/result.md`), txt = existsSync(res) ? readFileSync(res, 'utf8') : '(没有结果)';
  writeFileSync(path.join(outDir, `${s}.md`), txt);
  const now = score(txt), was = prev && existsSync(path.join(root, `docs/judge/${prev}/${s}.md`)) ? score(readFileSync(path.join(root, `docs/judge/${prev}/${s}.md`), 'utf8')) : null;
  rows.push(`| ${s} | ${now ? now.total : '?'} | ${was ? was.total : '–'} | ${now ? now.line.replace(/^总分\s*[\d.]+\s*\/\s*10/, '') : ''} |`);
}
const table = `# 关键画面评审 ${round}${prev ? `(上一轮 ${prev})` : ''}\n\n| 画面 | 本轮 | 上一轮 | 分项 |\n|---|---|---|---|\n${rows.join('\n')}\n`;
writeFileSync(path.join(outDir, 'scores.md'), table);
console.log(table);
