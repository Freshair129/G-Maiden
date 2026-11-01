import type { GannFramePair } from './gannDecodeQueue'

/** Composite the WebM alpha plane as raw luma, without YUV range expansion. */
export class GannFrameSurface {
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly buffer: WebGLBuffer
  private readonly textures: WebGLTexture[] = []
  private alphaBytes = new Uint8Array(0)
  private closed = false
  constructor(readonly canvas: HTMLCanvasElement, width: number, height: number) {
    canvas.width = width; canvas.height = height
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false })
    if (!gl) throw new Error('GANN WebGL2 unavailable')
    this.gl = gl
    const shader = (type: number, source: string) => {
      const result = gl.createShader(type)
      if (!result) throw new Error('GANN shader unavailable')
      gl.shaderSource(result, source); gl.compileShader(result)
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) { gl.deleteShader(result); throw new Error('GANN shader compile failed') }
      return result
    }
    const vertex = shader(gl.VERTEX_SHADER, `#version 300 es
      in vec2 p; out vec2 uv;
      void main(){uv=vec2((p.x+1.0)*.5,(1.0-p.y)*.5);gl_Position=vec4(p,0,1);}`)
    const fragment = shader(gl.FRAGMENT_SHADER, `#version 300 es
      precision mediump float; in vec2 uv;
      uniform sampler2D color; uniform sampler2D alpha; out vec4 result;
      void main(){float a=texture(alpha,uv).r;result=vec4(texture(color,uv).rgb*a,a);}`)
    const program = gl.createProgram(), buffer = gl.createBuffer()
    if (!program || !buffer) throw new Error('GANN surface allocation failed')
    this.program = program; this.buffer = buffer
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program)
    gl.deleteShader(vertex); gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('GANN shader link failed')
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const location = gl.getAttribLocation(program, 'p')
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(location)
    for (let i = 0; i < 2; i++) {
      const texture = gl.createTexture()
      if (!texture) throw new Error('GANN texture allocation failed')
      this.textures.push(texture); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }
    gl.uniform1i(gl.getUniformLocation(program, 'color'), 0)
    gl.uniform1i(gl.getUniformLocation(program, 'alpha'), 1)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([255]))
  }
  async draw(pair: GannFramePair) {
    const gl = this.gl
    let layout: PlaneLayout[] | undefined
    if (pair.alpha) {
      if (pair.alpha.format !== 'I420') throw new Error('GANN alpha plane format unsupported')
      const size = pair.alpha.allocationSize()
      if (this.alphaBytes.length < size) this.alphaBytes = new Uint8Array(size)
      layout = await pair.alpha.copyTo(this.alphaBytes)
    }
    if (this.closed) return
    if (gl.isContextLost()) throw new Error('GANN surface lost')
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures[0])
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pair.color)
    if (layout) {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.textures[1])
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, layout[0].stride)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.canvas.width, this.canvas.height, 0, gl.RED, gl.UNSIGNED_BYTE,
        this.alphaBytes.subarray(layout[0].offset))
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0)
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.flush()
  }
  dispose() {
    if (this.closed) return
    this.closed = true
    for (const texture of this.textures) this.gl.deleteTexture(texture)
    this.gl.deleteBuffer(this.buffer); this.gl.deleteProgram(this.program)
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
    this.alphaBytes = new Uint8Array(0)
  }
}
