# r15:在 X 上搜:浏览器里做出电影级雨夜城市/霓虹街/机器人,别人用了哪些技术和工具(只读调研)

用户对我们的画面质量很不满意(和 reference/x-cyber.mp4、xikhar/cybercity、thtbee 的 kestrel-k1 比)。他说你在 X 上搜索能力强,请你去找。
我们的技术栈:three.js r186 WebGPURenderer + TSL 节点材质、Vite;已有 SSR、TRAA、景深、泛光、AgX、体积光、GPU 雨、VAT 人群、cybercity 楼体贴图集。

请找(近一年,优先有演示网址或 GitHub 的):
1. three.js / WebGPU 里做"很多霓虹灯照亮墙面和湿地面"的方法:clustered/tiled lighting、forward+、大量 point/rect area light 的性能做法、用 emissive + 解析光照/贴图烘焙代替真实灯光、light probe / irradiance volume、SSGI、屏幕空间光照。
2. 让画面"像电影"的后期和着色器:湿地面倒影(planar reflection vs SSR)、雨中光晕、镜头污渍/水滴、体积雾的彩色散射、chromatic aberration、film grain、LUT。
3. 能直接用的库/插件:例如 pmndrs/postprocessing、realism-effects、N8AO、three-gpu-pathtracer、three-mesh-bvh、@react-three/drei 里的 MeshReflectorMaterial、LTC 面光源 RectAreaLight、three.js 官方 webgpu 示例里的 SSGI/GTAO/SSS/TRAA/BloomNode/ LensflareNode 等——哪些在 WebGPU+TSL 下可用。
4. 用 AI 生成 3D 资产做场景的工作流(Tripo、Meshy、Rodin/Hyper3D、Hunyuan3D):分部件生成、多视图、贴图、减面,在 X 上大家的经验。
5. 有人在 X 上用 three.js 做的同类作品里质量最高的 5–10 个,各写一句它好在哪里。

每条写:来源链接(帖子/仓库/演示)、具体做法、对我们最有用的一点、在 WebGPU/TSL 下能不能用。按"对提高我们画面最有用"排序,写到 result.md(任务目录)。不要下载到项目目录,不要启动浏览器或 Blender。
