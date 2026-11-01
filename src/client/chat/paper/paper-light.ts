/**
 * 纸面的一遍光：SURFACE 出 albedo 与法线两张图，LIGHT 在它们上面算辐照度，结果画在 canvas 上，
 * 由样式表用 multiply 压到正文底下。
 *
 * 双通道 FBO 与着色器原文都照 nocturne 的 core/paper-light.js 搬，只做类型化。两个 pass 拆开的原因
 * 是纸纹太贵：SURFACE 只在尺寸、明暗档或纸纹强度变了时重跑，LIGHT 却每次灯动都要跑
 *
 * 这一层画出来的东西接近白：albedo 在亮纸上就是 1.0，灯把它乘成 0.8 到 1.0 之间的一片。
 * 所以纸色本身不归这里——底色由 paper-tokens 写 token 提供，这一层只负责"灯照在纸上"这个明暗与纹理
 */
import type {LightRig} from "./paper-light-model"
import {ambientLevel} from "./paper-light-model"
import {clamp, toUnit} from "./paper-math"
import {LIGHT, SURFACE, VERTEX} from "./paper-shaders"
import type {PaperDefinition, PaperSettings, RoomDefinition} from "./paper-tables"

// 一次 build 需要的全部输入。pixelRatio 是已经按像素预算压过的那个值，这里不再算
export interface PaperBuildSpec {
    // CSS 像素宽
    width: number
    // CSS 像素高
    height: number
    // 画布像素与 CSS 像素之比
    pixelRatio: number
    // 这一档纸的材质参数
    paper: PaperDefinition
    // 纸纹强度的乘子（PAPER_DEFAULT_SETTINGS.texture）
    texture: number
}

// LIGHT 那次 pass 的输入：灯架、纸、房间、参数，以及时间
export interface PaperLightFrame {
    rig: LightRig
    paper: PaperDefinition
    room: RoomDefinition
    settings: PaperSettings
    // 秒。只在颗粒要动的时候才有意义，其余时候传 0
    time: number
    // prefers-reduced-motion。开着时颗粒是 0，静态的纸不该有噪点在跳
    reduceMotion: boolean
}

/**
 * 每一个 uniform 的位置。名字与着色器里的声明一字不差，两处同时改才生效——
 * 这是 locate() 唯一需要的知识
 */
interface SurfaceUniforms {
    uSize: WebGLUniformLocation | null
    uScale: WebGLUniformLocation | null
    uSeed: WebGLUniformLocation | null
    uFold: WebGLUniformLocation | null
    uFelt: WebGLUniformLocation | null
    uAge: WebGLUniformLocation | null
    uMottle: WebGLUniformLocation | null
    uCrinkle: WebGLUniformLocation | null
    uLaid: WebGLUniformLocation | null
    uLinen: WebGLUniformLocation | null
    uPaper: WebGLUniformLocation | null
}

interface LightUniforms {
    uAlbedo: WebGLUniformLocation | null
    uNormal: WebGLUniformLocation | null
    uSize: WebGLUniformLocation | null
    uScale: WebGLUniformLocation | null
    uSource: WebGLUniformLocation | null
    uLightPos: WebGLUniformLocation | null
    uLightDir: WebGLUniformLocation | null
    uCone: WebGLUniformLocation | null
    uExposure: WebGLUniformLocation | null
    uWindow: WebGLUniformLocation | null
    uPanes: WebGLUniformLocation | null
    uTint: WebGLUniformLocation | null
    uLamp: WebGLUniformLocation | null
    uAmbient: WebGLUniformLocation | null
    uAmbientTint: WebGLUniformLocation | null
    uRelief: WebGLUniformLocation | null
    uCrinkle: WebGLUniformLocation | null
    uGrain: WebGLUniformLocation | null
    uTime: WebGLUniformLocation | null
    uSoft: WebGLUniformLocation | null
    uPaperLuma: WebGLUniformLocation | null
}

// 灯架的 source 到着色器里那个整数。顺序是 GLSL 里 uSource 的约定，不是数组顺序
const SOURCE_CODE: Readonly<Record<LightRig["source"], number>> = {
    carriage: 0,
    "desk-lamp": 1,
    moonlight: 2,
    still: 3,
}

/**
 * 纸面那一层。一个实例对一片 canvas，资源与 WebGL context 同寿命。
 *
 * state 是对外的：mount 只在 ready 时才画，失败就整块不挂，读者看到的是没有纸的界面而不是一片黑
 */
export class PaperLight {
    readonly canvas: HTMLCanvasElement
    readonly gl: WebGL2RenderingContext | null
    // initializing 只在构造函数里那一瞬，ready 之后才画得出来
    state: "initializing" | "ready" | "lost" | "failed" | "disposed" = "initializing"

    // 上一帧那两个程序、顶点缓冲与 uniform 位置；context 丢了之后全部作废
    private surfaceProgram: WebGLProgram | null = null
    private lightProgram: WebGLProgram | null = null
    private buffer: WebGLBuffer | null = null
    private surfaceUniforms: SurfaceUniforms | null = null
    private lightUniforms: LightUniforms | null = null
    // 两个颜色附件：0 是 albedo，1 是法线
    private textures: WebGLTexture[] = []
    private framebuffer: WebGLFramebuffer | null = null
    // 最近一次 build 的输入。render 靠它拿尺寸与档位，所以它必须在
    private spec: PaperBuildSpec | null = null

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas
        this.gl = canvas.getContext("webgl2", {premultipliedAlpha: false, antialias: false})
        this.state = this.gl === null ? "failed" : "initializing"
        if (this.gl === null) return
        this.initialize()
    }

    /**
     * 重新算纸纹：SURFACE 那次 pass，外加为两个颜色附件重建 FBO 与两张纹理。
     *
     * 尺寸、明暗档、纸纹强度任一项变了才需要它——它比 LIGHT 贵一个量级，所以 mount 拿尺寸与档位当脏标记
     */
    build(spec: PaperBuildSpec): void {
        const gl = this.gl
        if (gl === null || this.state !== "ready") return
        const width = Math.max(1, Math.round(spec.width * spec.pixelRatio))
        const height = Math.max(1, Math.round(spec.height * spec.pixelRatio))
        this.canvas.width = width
        this.canvas.height = height
        this.spec = spec
        this.release()

        const framebuffer = gl.createFramebuffer()
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
        for (let index = 0; index < 2; index += 1) {
            const texture = gl.createTexture()
            gl.bindTexture(gl.TEXTURE_2D, texture)
            // texStorage2D 而不是 texImage2D：两级都是不可变的，采样器不会擅自做 mip
            gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, gl.TEXTURE_2D, texture, 0)
            this.textures.push(texture)
        }
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
        this.framebuffer = framebuffer
        this.paintSurface(spec, width, height)
    }

    /**
     * 点灯：LIGHT 那次 pass。灯动、明暗档换、尺寸变、窗口重新聚焦之后都要来一次。
     *
     * 没 build 过、context 丢了、或者已经 dispose 时什么都不做——宁可纸停在上一帧，不要画一片白
     */
    render(frame: PaperLightFrame): void {
        const gl = this.gl
        const uniforms = this.lightUniforms
        const spec = this.spec
        if (gl === null || uniforms === null || spec === null) return
        if (this.state !== "ready" || gl.isContextLost()) return
        const albedoTexture = this.textures[0]
        const normalTexture = this.textures[1]
        if (albedoTexture === undefined || normalTexture === undefined) return

        const lightColor = toUnit(frame.room.light.color)
        const peak = Math.max(lightColor[0], lightColor[1], lightColor[2], 1e-6)
        const roomColor = toUnit(frame.room.palette.room)
        // 房间色往纸面推多少。nocturne 用 0.4：那时环境光只占三成，房间色把整片纸染凉是它想要的观感。
        // 现在环境光占九成多，同样的强度会把一整张纸统统压灰，所以收到 0.12——房间里那点暖只留在灯下面
        const strength = frame.rig.source === "moonlight" ? .3 : .12
        const tintChannel = (channel: number): number => 1 + ((.6 + channel * 1.5) - 1) * strength
        const lampOn = frame.settings.lamp && frame.settings.enabled
        // 纸的相对亮度：着色器拿它当抖动的除数。这一层是 multiply 压在页面上（最终像素 = 纸色 × 这里的值），
        // 所以纸越暗，纸上一个最终色阶就吃掉越多 canvas 级——暗纸 43 个灰阶、一个台阶 5.9 级，
        // 亮纸 242 个、只吃 1.1 级，同一个抖动幅度在暗纸上只盖得住台阶的四分之一
        const paperColor = toUnit(frame.paper.paper)
        // 兜住零：除数取到 0 会把抖动放大成无穷大，整张纸变成一片噪点
        const paperLuma = Math.max(.05, .2126 * paperColor[0] + .7152 * paperColor[1] + .0722 * paperColor[2])

        gl.useProgram(this.lightProgram)
        gl.viewport(0, 0, this.canvas.width, this.canvas.height)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, albedoTexture)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, normalTexture)
        gl.uniform1i(uniforms.uAlbedo, 0)
        gl.uniform1i(uniforms.uNormal, 1)
        gl.uniform2f(uniforms.uSize, spec.width, spec.height)
        gl.uniform1f(uniforms.uScale, spec.pixelRatio)
        gl.uniform1i(uniforms.uSource, SOURCE_CODE[frame.rig.source])
        gl.uniform3fv(uniforms.uLightPos, frame.rig.position)
        gl.uniform3fv(uniforms.uLightDir, frame.rig.direction)
        gl.uniform2f(uniforms.uCone, frame.rig.cosOuter, frame.rig.cosInner)
        gl.uniform1f(uniforms.uExposure, frame.rig.exposure)
        gl.uniform4f(uniforms.uWindow, frame.rig.window.x, frame.rig.window.y, frame.rig.window.width, frame.rig.window.height)
        gl.uniform4f(uniforms.uPanes, frame.rig.window.columns, frame.rig.window.rows, frame.rig.window.softness, frame.rig.window.skew)
        // 归一化到峰值：真正的亮度由 exposure 与 lamp 决定，颜色只负责色相
        gl.uniform3f(uniforms.uTint, lightColor[0] / peak, lightColor[1] / peak, lightColor[2] / peak)
        gl.uniform1f(uniforms.uLamp, lampOn ? 1 : 0)
        gl.uniform1f(uniforms.uAmbient, ambientLevel(frame.paper.mode))
        gl.uniform3f(uniforms.uAmbientTint, tintChannel(roomColor[0]), tintChannel(roomColor[1]), tintChannel(roomColor[2]))
        gl.uniform1f(uniforms.uRelief, 2 * frame.settings.paperIllumination)
        gl.uniform1f(uniforms.uSoft, frame.settings.beam === "soft" ? 1 : 0)
        gl.uniform1f(uniforms.uCrinkle, frame.paper.surface.crinkle * frame.settings.texture)
        gl.uniform1f(uniforms.uGrain, frame.reduceMotion ? 0 : frame.settings.grain)
        gl.uniform1f(uniforms.uTime, frame.time)
        gl.uniform1f(uniforms.uPaperLuma, paperLuma)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    /**
     * context 丢了：旧句柄由浏览器回收，这里只把引用清干净，恢复之后必须整块重建。
     *
     * 状态记成 lost 而不是 failed——这两者的处置不同，failed 不再试，lost 等 restored 事件
     */
    invalidate(): void {
        this.spec = null
        this.textures = []
        this.framebuffer = null
        this.buffer = null
        this.surfaceProgram = null
        this.lightProgram = null
        this.surfaceUniforms = null
        this.lightUniforms = null
        this.state = "lost"
    }

    // context 回来了：重建全部与 context 同寿命的资源，然后由调用方重新 build
    restore(): boolean {
        if (this.gl === null) {
            this.state = "failed"
            return false
        }
        this.invalidate()
        return this.initialize()
    }

    // 彻底卸下。样式表里这片 canvas 也随之摘掉，所以这里不再关心画面
    destroy(): void {
        this.release()
        const gl = this.gl
        if (gl !== null) {
            if (this.buffer !== null) gl.deleteBuffer(this.buffer)
            if (this.surfaceProgram !== null) gl.deleteProgram(this.surfaceProgram)
            if (this.lightProgram !== null) gl.deleteProgram(this.lightProgram)
        }
        this.buffer = null
        this.surfaceProgram = null
        this.lightProgram = null
        this.spec = null
        this.state = "disposed"
    }

    /**
     * 建全部与 context 同寿命的资源。构造与 restore 两处都走它，所以失败只有这一个出口：
     * 抛出、接住、记 failed，然后由样式表让纸整块不出现
     */
    private initialize(): boolean {
        const gl = this.gl
        if (gl === null) {
            this.state = "failed"
            return false
        }
        try {
            this.surfaceProgram = this.compile(VERTEX, SURFACE)
            this.lightProgram = this.compile(VERTEX, LIGHT)
            this.buffer = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
            // 一个盖住整个裁剪空间的三角形：比两个三角形省一次光栅化边界上的重复着色
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
            gl.enableVertexAttribArray(0)
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
            this.surfaceUniforms = this.locate(this.surfaceProgram, [
                "uSize", "uScale", "uSeed", "uFold", "uFelt", "uAge", "uMottle", "uCrinkle", "uLaid", "uLinen", "uPaper",
            ]) as unknown as SurfaceUniforms
            this.lightUniforms = this.locate(this.lightProgram, [
                "uAlbedo", "uNormal", "uSize", "uScale", "uSource", "uLightPos", "uLightDir", "uCone", "uExposure",
                "uWindow", "uPanes", "uTint", "uLamp", "uAmbient", "uAmbientTint", "uRelief", "uCrinkle", "uGrain",
                "uTime", "uSoft", "uPaperLuma",
            ]) as unknown as LightUniforms
            this.state = "ready"
            return true
        } catch (error) {
            // 没有 WebGL2、或者驱动拒绝编译：整块纸不画。页面照常，只是没有纸
            console.warn("dsh-chat-ux paper: shader", error instanceof Error ? error.message : error)
            this.state = "failed"
            return false
        }
    }

    // 编一段程序。顶点着色器与片元着色器分开传，因为 SURFACE 与 LIGHT 共用 VERTEX，
    // 位置 0 显式绑给 aPos：省得依赖编译器自动分配
    private compile(vertexSource: string, fragmentSource: string): WebGLProgram {
        const gl = this.gl
        if (gl === null) throw new Error("webgl2 context is gone")
        const program = gl.createProgram()
        const stages: Array<[number, string]> = [
            [gl.VERTEX_SHADER, vertexSource],
            [gl.FRAGMENT_SHADER, fragmentSource],
        ]
        for (const [kind, source] of stages) {
            const shader = gl.createShader(kind)
            if (shader === null) continue
            gl.shaderSource(shader, source)
            gl.compileShader(shader)
            if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed")
            gl.attachShader(program, shader)
            // 链上之后就没用了：deleteShader 只是打上待删标记，程序还拿着它的编译结果，
            // 程序删掉时才会真正释放。留着它反而要多管一份句柄的寿命
            gl.deleteShader(shader)
        }
        gl.bindAttribLocation(program, 0, "aPos")
        gl.linkProgram(program)
        if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) throw new Error(gl.getProgramInfoLog(program) ?? "program link failed")
        return program
    }

    /**
     * 把一串 uniform 名字换成位置。
     *
     * 也接受 null 名字：Shader 里没用到的 uniform 在链接期被优化掉，getUniformLocation 返回 null，
     * 之后对它 set 是合法的空操作。类型上带 null 是为了让这条路径不被当成错误
     */
    private locate(program: WebGLProgram, names: readonly string[]): Record<string, WebGLUniformLocation | null> {
        const gl = this.gl
        const positions: Record<string, WebGLUniformLocation | null> = {}
        if (gl === null) return positions
        for (const name of names) positions[name] = gl.getUniformLocation(program, name)
        return positions
    }

    // SURFACE 那次 pass 本身。build 里紧接着 FBO 建好之后调用，所以它读的是刚设好的 spec
    private paintSurface(spec: PaperBuildSpec, pixelWidth: number, pixelHeight: number): void {
        const gl = this.gl
        const uniforms = this.surfaceUniforms
        if (gl === null || uniforms === null) return
        gl.useProgram(this.surfaceProgram)
        gl.viewport(0, 0, pixelWidth, pixelHeight)
        gl.uniform2f(uniforms.uSize, spec.width, spec.height)
        gl.uniform1f(uniforms.uScale, spec.pixelRatio)
        gl.uniform1f(uniforms.uSeed, 3.7)
        gl.uniform1f(uniforms.uFold, spec.height * 0.38)
        // 纸纹的低频结构按纸的物理尺寸缩放：着色器是按 ~660×620 的纸调的，
        // 同样的频率铺到 1200px 的纸上，斑块就碎成了噪点（nocturne 文档 3.1）
        gl.uniform1f(uniforms.uPaper, clamp(Math.sqrt(spec.width * spec.height) / 700, 0.9, 1.9))
        gl.uniform1f(uniforms.uFelt, spec.paper.surface.felt)
        gl.uniform1f(uniforms.uAge, spec.paper.surface.age)
        gl.uniform1f(uniforms.uMottle, spec.paper.surface.mottle)
        gl.uniform1f(uniforms.uCrinkle, spec.paper.surface.crinkle * spec.texture)
        gl.uniform1f(uniforms.uLaid, spec.paper.surface.laid * Math.min(1, spec.texture))
        gl.uniform1f(uniforms.uLinen, spec.paper.surface.linen * Math.min(1, spec.texture))
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }

    // 扔掉两个颜色附件与 FBO。纹理与 FBO 是一起建的，也就一起扔
    private release(): void {
        const gl = this.gl
        if (gl === null) return
        for (const texture of this.textures) gl.deleteTexture(texture)
        this.textures = []
        if (this.framebuffer !== null) {
            gl.deleteFramebuffer(this.framebuffer)
            this.framebuffer = null
        }
    }
}
