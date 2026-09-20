import { randomBytes } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { DroneDesignSnapshotSchema, type DroneDesignSnapshot, type UserPart } from '@fwx/parts-schema'
import { customConnectors, officialConnectors, validateAssemblyConnections, worldConnector, type ConnectorResolver } from '@fwx/geometry'
import { Euler, Quaternion, Vector3 } from 'three'
import { drawStarterRectangle, drawStudioShape } from './part-studio-helpers'

async function read(page: Page): Promise<DroneDesignSnapshot> {
  return DroneDesignSnapshotSchema.parse(await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('drone_app_design_store')!).state
    return state.designs.find((d: { id:string }) => d.id === state.activeDesignId)
  }))
}
function expectPhysicalJoints(design: DroneDesignSnapshot, resolve: ConnectorResolver) {
  for (const child of design.parts.filter(p=>p.attachedTo)) {
    const parent = design.parts.find(p=>p.instanceId===child.attachedTo!.parentInstanceId)!
    const a = resolve(parent).find(c=>c.id===child.attachedTo!.parentConnectorId)!
    const b = resolve(child).find(c=>c.id===child.activeConnectorId)!
    const qa = new Quaternion().setFromEuler(new Euler(...parent.rotation))
    const qb = new Quaternion().setFromEuler(new Euler(...child.rotation))
    expect(Math.abs(new Vector3(...(a.boardNormal ?? [0,1,0])).applyQuaternion(qa).dot(new Vector3(...(b.boardNormal ?? [0,1,0])).applyQuaternion(qb)))).toBeLessThan(1e-5)
    // GLB float32 frames near Euler gimbal lock retain sub-micrometre error.
    expect(new Vector3(...worldConnector(parent,a).position).distanceTo(new Vector3(...worldConnector(child,b).position))).toBeLessThan(1e-7)
  }
}
async function register(page: Page) {
  const name = `asm_${randomBytes(5).toString('hex')}`
  await page.goto('/register')
  await page.getByLabel('用户名', {exact:true}).fill(name)
  await page.getByLabel('邮箱', {exact:true}).fill(`${name}@example.test`)
  await page.getByRole('checkbox',{name:/我已阅读并同意/}).check()
  try {
    try { await page.getByLabel('密码',{exact:true}).fill(randomBytes(24).toString('base64url')) } catch { throw new Error('Could not fill isolated test registration.') }
    await page.getByRole('button',{name:'创建账号',exact:true}).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  } finally {
    await page.locator('input[type="password"]').evaluateAll(inputs => inputs.forEach(input => { (input as HTMLInputElement).value = ''; input.setAttribute('value','') })).catch(() => {})
  }
}
async function newWork(page: Page, mode: 'guided' | 'free') {
  await page.goto('/dashboard')
  await page.getByRole('button',{name:'新建作品',exact:true}).first().click()
  await expect(page.getByRole('button',{name:'开始搭建',exact:true})).toBeDisabled()
  await page.getByLabel('无人机名字',{exact:true}).fill(`拼装测试 ${mode}`)
  await page.getByRole('radio',{name:mode === 'guided' ? /按步骤拼装/ : /自由拼装/}).check()
  await page.getByRole('button',{name:'开始搭建',exact:true}).click()
  await expect(page).toHaveURL(/\/design\/design-/)
  expect((await read(page)).buildMode).toBe(mode)
}
async function openLibrary(page: Page) {
  if (await page.getByRole('button',{name:'展开零件库',exact:true}).isVisible()) await page.getByRole('button',{name:'展开零件库',exact:true}).click()
  await page.getByRole('button',{name:'自制零件',exact:true}).first().click()
}
async function drawPart(page: Page, name: string, secondSlot = false) {
  await drawStarterRectangle(page)
  await drawStudioShape(page,'插接口',[35,65],[55,65])
  if (secondSlot) await drawStudioShape(page,'插接口',[95,65],[75,65])
  await page.getByLabel('零件名称',{exact:true}).fill(name)
  const saving = page.waitForResponse(r => new URL(r.url()).pathname === '/api/custom-parts' && r.request().method() === 'POST')
  await page.getByRole('button',{name:'保存',exact:true}).click()
  const response = await saving
  expect(response.status()).toBe(201)
  const part: UserPart = (await response.json()).data
  await page.getByRole('dialog',{name:'放入作品',exact:true}).getByRole('button',{name:'确认放入',exact:true}).click()
  await expect(page).toHaveURL(/\/design\/design-/)
  return part
}
async function openConnect(page: Page) {
  if (await page.getByRole('button',{name:'展开零件列表',exact:true}).isVisible()) await page.getByRole('button',{name:'展开零件列表',exact:true}).click()
  await page.getByRole('button',{name:'连接零件',exact:true}).click()
}
async function connect(page: Page, child: string, own: string, parent: string, target: string, expectedSaveStatus = 200) {
  await openConnect(page)
  await page.getByLabel('移动零件',{exact:true}).selectOption(child)
  await page.getByLabel('移动插接口',{exact:true}).selectOption(own)
  await page.getByLabel('固定零件',{exact:true}).selectOption(parent)
  await page.getByLabel('固定插接口',{exact:true}).selectOption(target)
  const saving = page.waitForResponse(r => {
    if (new URL(r.url()).pathname !== '/api/drone-designs' || r.request().method() !== 'PUT') return false
    const snapshot = r.request().postDataJSON()?.designData as DroneDesignSnapshot | undefined
    const connected = snapshot?.parts.find(p => p.instanceId === child)
    return connected?.activeConnectorId === own && connected.attachedTo?.parentInstanceId === parent && connected.attachedTo.parentConnectorId === target
  })
  await page.getByRole('button',{name:'连接插接口',exact:true}).click()
  expect((await saving).status()).toBe(expectedSaveStatus)
  await expect(page.getByRole('dialog',{name:'连接零件',exact:true})).toHaveCount(0)
  const design = await read(page)
  expect(design.parts.find(p => p.instanceId === child)?.attachedTo).toEqual({parentInstanceId:parent,parentConnectorId:target})
  return design
}

test('both modes expose own parts; slot connections survive real saving, reload and rigid movement', async ({page,context,browser}, info) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['http:','https:'].includes(url.protocol) && !['127.0.0.1','localhost','[::1]'].includes(url.hostname) ? route.abort() : route.continue()
  })
  await register(page)
  await page.setViewportSize({width:390,height:844})
  await newWork(page,'free')
  await page.setViewportSize({width:1440,height:900})
  const freeId = (await read(page)).id
  await openLibrary(page)
  await page.getByRole('link',{name:'绘制零件',exact:true}).click()
  await expect(page).toHaveURL(new RegExp(`design=${freeId}`))
  const first = await drawPart(page,'双接口主机身',true)
  await openLibrary(page)
  await page.getByRole('link',{name:'绘制零件',exact:true}).click()
  const second = await drawPart(page,'单接口木片')
  let design = await read(page)
  const a = design.parts[0]!, b = design.parts[1]!
  const aFrames = customConnectors(first), bFrames = customConnectors(second)
  design = await connect(page,b.instanceId,bFrames[0]!.id,a.instanceId,aFrames[0]!.id)
  const resolve = (p: typeof a) => p.source ? customConnectors(p.source.id === first.id ? first : second) : officialConnectors(p.partId)
  expect(validateAssemblyConnections(design.parts,resolve)).toBeNull()
  const position = page.getByLabel('自制零件 X 位置（毫米）',{exact:true}).first()
  await position.fill('25')
  await position.press('Tab')
  expect(validateAssemblyConnections((await read(page)).parts,resolve)).toBeNull()
  await page.getByRole('button',{name:'保存',exact:true}).click()
  await page.reload()
  await expect.poll(async () => (await read(page)).parts.length).toBe(2)
  expect(validateAssemblyConnections((await read(page)).parts,resolve)).toBeNull()
  // The connected work must also come back from the API, not only localStorage.
  const restored = await page.evaluate(async id => {
    const auth = JSON.parse(localStorage.getItem('auth-storage') ?? '{}').state
    const response = await fetch('/api/drone-designs',{headers:{Authorization:`Bearer ${auth?.token}`}})
    const body = await response.json()
    return {status:response.status,design:body.items.find((d: { localId:string }) => d.localId===id)}
  },freeId)
  expect(restored.status).toBe(200)
  expect(restored.design.designData.parts[1].attachedTo).toEqual((await read(page)).parts[1]!.attachedTo)
  for (const [width,height] of [[1440,900],[768,1024],[390,844]]) {
    await page.setViewportSize({width:width!,height:height!})
    await openConnect(page)
    await page.getByLabel('移动零件',{exact:true}).selectOption(b.instanceId)
    await expect(page.getByRole('dialog',{name:'连接零件',exact:true}).getByRole('button',{name:'断开连接',exact:true})).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({path:info.outputPath(`connections-${width}.png`)})
    await page.getByRole('button',{name:'关闭模态框',exact:true}).click()
  }
  await page.setViewportSize({width:1440,height:900})
  // Official child -> custom parent, then the reverse direction, using actual model frames.
  if (await page.getByRole('button',{name:'展开零件库',exact:true}).isVisible()) await page.getByRole('button',{name:'展开零件库',exact:true}).click()
  await page.getByRole('button',{name:'主板',exact:true}).click()
  await page.getByRole('button',{name:'零件详情：主板件01',exact:true}).click()
  await page.getByRole('button',{name:'添加到设计',exact:true}).click()
  await expect.poll(async () => (await read(page)).parts.length).toBe(3)
  const official = (await read(page)).parts.find(p => !p.source)!
  const officialFrames = officialConnectors(official.partId)
  await expect(page.getByText(`${officialFrames.length} 个连接点`,{exact:true})).toBeVisible()
  // Catalog additions now attach immediately to the remaining custom slot.
  design = await read(page)
  expect(official.attachedTo).toEqual({parentInstanceId:a.instanceId,parentConnectorId:aFrames[1]!.id})
  expectPhysicalJoints(design,resolve)
  expect(validateAssemblyConnections(design.parts,resolve)).toBeNull()
  await openConnect(page)
  await page.getByLabel('移动零件',{exact:true}).selectOption(official.instanceId)
  await page.getByRole('dialog',{name:'连接零件',exact:true}).getByRole('button',{name:'断开连接',exact:true}).click()
  await page.getByRole('button',{name:'关闭模态框',exact:true}).click()
  let failSave = true
  await page.route('**/api/drone-designs', async route => {
    const request = route.request()
    const snapshot = request.method() === 'PUT' ? request.postDataJSON()?.designData as DroneDesignSnapshot | undefined : undefined
    const isTargetConnection = snapshot?.parts.find(p => p.instanceId === a.instanceId)?.attachedTo?.parentInstanceId === official.instanceId
    if (isTargetConnection && failSave) { failSave = false; await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'隔离测试：暂时无法保存'})}) }
    else await route.continue()
  })
  design = await connect(page,a.instanceId,aFrames[1]!.id,official.instanceId,officialFrames[0]!.id,503)
  expectPhysicalJoints(design,resolve)
  await page.unroute('**/api/drone-designs')
  const retry = page.waitForResponse(r => new URL(r.url()).pathname === '/api/drone-designs' && r.request().method() === 'PUT')
  await page.getByRole('button',{name:'保存',exact:true}).click()
  expect((await retry).status()).toBe(200)
  expect(validateAssemblyConnections(design.parts,resolve)).toBeNull()
  await page.reload()
  expect(validateAssemblyConnections((await read(page)).parts,resolve)).toBeNull()
  await expect(page.getByRole('button',{name:'连接零件',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'双接口主机身',exact:true})).toBeVisible()
  await expect(page.getByText('正在加载零件…',{exact:true})).toHaveCount(0)
  await expect(page.getByText('正在读取自制零件…',{exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'双接口主机身',exact:true}).click()
  await expect(page.getByTitle('插接口 1 · 已占用',{exact:true})).toBeVisible()
  await expect(page.getByText('正在加载零件…',{exact:true})).toHaveCount(0)
  await page.screenshot({path:info.outputPath('mixed-connected-1440.png')})
  const auth = await page.evaluate(() => localStorage.getItem('auth-storage'))
  if (!auth) throw new Error('Isolated session is unavailable')
  const origin = new URL(page.url()).origin
  const clean = await browser.newContext({baseURL:origin,storageState:{cookies:[],origins:[{origin,localStorage:[{name:'auth-storage',value:auth}]}]}})
  try {
    const reopened = await clean.newPage()
    reopened.on('pageerror', e => errors.push(e.message))
    await reopened.goto(`/design/${freeId}`)
    await expect(reopened.getByRole('button',{name:'双接口主机身',exact:true})).toBeVisible()
    await expect.poll(async () => (await read(reopened)).parts.length).toBe(3)
    expect((await read(reopened)).parts.filter(p => p.attachedTo)).toHaveLength(2)
    expect(validateAssemblyConnections((await read(reopened)).parts,resolve)).toBeNull()
  } finally { await clean.close() }
  await newWork(page,'guided')
  await expect(page.getByRole('button',{name:'放入作品：双接口主机身',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'放入作品：双接口主机身',exact:true}).click()
  await page.getByRole('button',{name:'确认放入',exact:true}).click()
  await expect.poll(async () => (await read(page)).parts.length).toBe(1)
  expect((await read(page)).buildMode).toBe('guided')
  await page.getByRole('button',{name:'放入作品：单接口木片',exact:true}).click()
  await page.getByRole('button',{name:'确认放入',exact:true}).click()
  await expect.poll(async () => (await read(page)).parts.length).toBe(2)
  const [guidedParent, guidedChild] = (await read(page)).parts
  const guided = await connect(page,guidedChild!.instanceId,bFrames[0]!.id,guidedParent!.instanceId,aFrames[0]!.id)
  expect(validateAssemblyConnections(guided.parts,resolve)).toBeNull()
  await page.getByRole('button',{name:'下一步 →',exact:true}).click()
  await page.getByRole('button',{name:'添加起落架01',exact:true}).click()
  await expect.poll(async () => (await read(page)).parts.length).toBe(3)
  const guidedMixed = await read(page)
  expect(guidedMixed.parts[2]!.attachedTo).toEqual({parentInstanceId:guidedParent!.instanceId,parentConnectorId:aFrames[1]!.id})
  expectPhysicalJoints(guidedMixed,resolve)
  await page.getByRole('button',{name:'绘制零件',exact:true}).click()
  await expect(page.getByLabel('参考类型',{exact:true})).toHaveValue('landing')
  await page.getByRole('button',{name:'返回',exact:true}).click()
  await expect(page).toHaveURL(/\/design\/design-/)
  expect((await read(page)).buildMode).toBe('guided')
  expect(errors).toEqual([])
})

test('real arm 37 connector roll stays perpendicular to a drawn board after reconnecting and server restore', async ({page},info) => {
  await register(page)
  await newWork(page,'free')
  await openLibrary(page)
  await page.getByRole('link',{name:'绘制零件',exact:true}).click()
  const source = await drawPart(page,'接口方向回归',true)
  const parent = (await read(page)).parts[0]!
  await page.getByRole('button',{name:'机臂',exact:true}).click()
  await page.getByRole('button',{name:'零件详情：起落架37',exact:true}).click()
  await page.getByRole('button',{name:'添加到设计',exact:true}).click()
  await expect.poll(async () => (await read(page)).parts.length).toBe(2)
  const child = (await read(page)).parts[1]!
  const resolve: ConnectorResolver = p=>p.source ? customConnectors(source) : officialConnectors(p.partId)
  expect(child.attachedTo?.parentInstanceId).toBe(parent.instanceId)
  expectPhysicalJoints(await read(page),resolve)
  await openConnect(page)
  await page.getByLabel('移动零件',{exact:true}).selectOption(child.instanceId)
  await page.getByRole('dialog',{name:'连接零件',exact:true}).getByRole('button',{name:'断开连接',exact:true}).click()
  await page.getByRole('button',{name:'关闭模态框',exact:true}).click()
  const result = await connect(page,child.instanceId,'PLUG_3',parent.instanceId,customConnectors(source)[1]!.id)
  expectPhysicalJoints(result,resolve)
  await page.reload()
  await expect(page.getByRole('button',{name:'接口方向回归',exact:true})).toBeVisible()
  expectPhysicalJoints(await read(page),resolve)
  await page.getByRole('button',{name:'接口方向回归',exact:true}).click()
  await expect(page.getByTitle('插接口 2 · 已占用',{exact:true})).toBeVisible()
  await expect(page.getByText(/正在加载零件/)).toHaveCount(0)
  await page.screenshot({path:info.outputPath('arm37-perpendicular.png')})
})

test('mouse and touch drops choose the indicated custom slot instead of the first slot', async ({page,context}) => {
  await register(page)
  await newWork(page,'free')
  await openLibrary(page)
  await page.getByRole('link',{name:'绘制零件',exact:true}).click()
  const source = await drawPart(page,'拖入连接测试',true)
  const parent = (await read(page)).parts[0]!
  const frames = customConnectors(source)
  await page.getByRole('button',{name:'机臂',exact:true}).click()
  const card = page.locator('[draggable="true"]').filter({has:page.getByRole('img',{name:'起落架01',exact:true})})
  const canvas = page.getByLabel('无人机三维拼装画布',{exact:true}).locator('canvas')
  for (const [index,input] of [[1,'mouse'],[0,'touch']] as const) {
    await page.getByRole('button',{name:'拖入连接测试',exact:true}).click()
    const marker = page.getByTitle(`插接口 ${index+1}`,{exact:true})
    await expect(marker).toBeVisible()
    const box = (await marker.boundingBox())!, origin = (await card.boundingBox())!
    const point = {x:box.x+box.width/2,y:box.y+box.height/2}
    const waiting = page.waitForResponse(r=>r.url().includes(`/api/custom-parts/${source.id}`) && r.request().method()==='GET')
    const nextFrame = ()=>page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
    if (input==='mouse') {
      const transfer = await page.evaluateHandle(()=>new DataTransfer())
      await card.dispatchEvent('dragstart',{dataTransfer:transfer,clientX:origin.x+10,clientY:origin.y+10})
      await waiting
      for (let move=0;move<3;move++) {
        await nextFrame()
        await canvas.dispatchEvent('dragover',{dataTransfer:transfer,clientX:point.x,clientY:point.y})
      }
      await canvas.dispatchEvent('drop',{dataTransfer:transfer,clientX:point.x,clientY:point.y})
      await transfer.dispose()
    } else {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:origin.x+30,y:origin.y+30}]})
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:origin.x+55,y:origin.y+30}]})
      await waiting
      for (let move=0;move<3;move++) {
        await nextFrame()
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]})
      }
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
      await cdp.detach()
    }
    await expect.poll(async()=>(await read(page)).parts.filter(p=>p.attachedTo?.parentConnectorId===frames[index]!.id).length).toBe(1)
    expect((await read(page)).parts.at(-1)!.attachedTo?.parentInstanceId).toBe(parent.instanceId)
    expectPhysicalJoints(await read(page),p=>p.source ? frames : officialConnectors(p.partId))
  }
})
