# 残破版物件:参考图提示词(草稿,待用户确认)

做法:每件用原来的参考图(`assets/generated/shop/refs/<名字>.png`)做图生图,只改"新旧",形状、比例、角度、背景都不变,这样生成的三维模型才能和原模型对得上,光束照到时逐像素换回完好版。

共同开头(每条都加):

> Edit the reference image. Keep exactly the same object: the same model, shape, proportions, colours, materials, camera angle, framing and scale, the entire object fully in frame with generous margin, isolated on the same plain light grey seamless studio background, soft even studio lighting, no cast shadows. Show it decades later, abandoned in a derelict shop:

1. **纸箱上的电视**(crt_tv_hero,原图 `refs/crt_tv.png`):
   > the screen glass smashed with a star-shaped crack radiating from a hole near the centre and a few shards missing, the upper channel knob broken off leaving a bare shaft, one antenna rod bent sideways and the other snapped short, a thick layer of grey dust on the top, the wood-grain cabinet faded, scratched and water-stained, one front corner chipped. No text, no logos, no people, sharp focus, photorealistic.

2. **墙上的摆钟**(wall_clock,原图 `refs/wall_clock.png`):
   > the glass door cracked diagonally from corner to corner, the pendulum broken off and lying at the bottom of the case, the minute hand missing and the hour hand hanging loose, the dial yellowed with brown water stains, the wooden case dusty with peeling varnish, the carved crest on top split. No text, no logos, no people, sharp focus, photorealistic.

3. **台扇**(desk_fan,原图 `refs/desk_fan.png`):
   > the chrome wire cage dented and pushed in on one side with a few wires snapped and sticking out, one of the four blades broken off, the pale green enamel chipped and rusted in patches, dust on the motor housing and the base, one push button missing. No text, no logos, no people, sharp focus, photorealistic.

4. **电子管收音机**(tube_radio_closed,原图 `refs/tube_radio_closed.png`):
   > the cloth speaker grille torn and sagging at one corner, the tuning dial glass cracked, the middle knob missing, two piano-key buttons broken off, the wooden veneer peeling and water-stained at the edges, a layer of dust on the top. No text, no logos, no people, sharp focus, photorealistic.
