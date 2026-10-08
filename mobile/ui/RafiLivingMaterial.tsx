import { PixelRatio } from 'react-native';
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { createMaterialMotion, type MaterialFrame } from './rafiMaterialMotion';
import { materialFragmentShader, materialVertexShader } from './rafiMaterialShader';
import type { RafiPresenceState } from './rafiPresence';

type Controller = ReturnType<typeof createMaterialMotion>;
export function RafiLivingMaterial({ diameter, compact, active, reduced, mode, subtle, controller, onError }: {
  diameter: number; compact: boolean; active: boolean; reduced: boolean; mode: RafiPresenceState; subtle: boolean;
  controller: MutableRefObject<Controller | null>; onError: () => void;
}) {
  const current = useRef({ active, reduced, mode, subtle });
  current.current = { active, reduced, mode, subtle };
  const dispose = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; dispose.current?.(); dispose.current = null; }; }, []);
  useEffect(() => { controller.current?.setMode(mode, subtle); controller.current?.setActivity(active, reduced); }, [active, reduced, mode, subtle, controller]);
  const create = useCallback((gl: ExpoWebGLRenderingContext) => {
    if (!mounted.current) return;
    dispose.current?.();
    let vertex: WebGLShader | null = null, fragment: WebGLShader | null = null;
    let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null;
    const cleanup = () => { controller.current?.dispose(); controller.current = null;
      if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program);
      if (vertex) gl.deleteShader(vertex); if (fragment) gl.deleteShader(fragment);
      buffer = null; program = null; vertex = null; fragment = null;
    };
    try {
      const shader = (type: number, source: string) => {
        const s = gl.createShader(type); if (!s) throw new Error('RAFI_SHADER');
        gl.shaderSource(s, source); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); throw new Error('RAFI_SHADER'); }
        return s;
      };
      vertex = shader(gl.VERTEX_SHADER, materialVertexShader); fragment = shader(gl.FRAGMENT_SHADER, materialFragmentShader);
      program = gl.createProgram(); if (!program) throw new Error('RAFI_PROGRAM');
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('RAFI_LINK');
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const attribute = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      const uniforms = Object.fromEntries(['time','flow','breath','tension','contact','compact'].map(key => [key, gl.getUniformLocation(program!, key)]));
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.clearColor(0,0,0,0);
      const draw = (f: MaterialFrame) => {
        if (!mounted.current || !program) return;
        try {
          gl.useProgram(program); gl.uniform1f(uniforms.time, f.time); gl.uniform1f(uniforms.flow, f.flow);
          gl.uniform1f(uniforms.breath, f.breath); gl.uniform1f(uniforms.tension, f.tension);
          gl.uniform1f(uniforms.compact, compact ? 1 : 0); gl.uniform3f(uniforms.contact, f.x, f.y, f.touch);
          gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.flush(); gl.endFrameEXP();
        } catch { cleanup(); onError(); }
      };
      controller.current = createMaterialMotion({ request: requestAnimationFrame, cancel: cancelAnimationFrame }, draw, compact);
      dispose.current = cleanup;
      controller.current.setMode(current.current.mode, current.current.subtle);
      draw(controller.current.snapshot());
      controller.current?.setActivity(current.current.active, current.current.reduced);
    } catch { cleanup(); onError(); }
  }, [compact, controller, onError]);
  const side = Math.min(diameter * 1.095, (compact ? 128 : 256) / PixelRatio.get());
  return <GLView testID="rafi-living-material" pointerEvents="none" msaaSamples={0}
    style={{ width: side, height: side, transform: [{scale: diameter * 1.095 / side}] }} onContextCreate={create} />;
}
