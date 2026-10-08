"""Execute RAFI's actual GLES shader offscreen; numeric proof, no visual certification.
Requires Mesa EGL (available on the Linux software gate runner). No image is saved.
"""
import ctypes as C
import json
import pathlib
import re
import statistics

egl = C.CDLL('libEGL.so.1')
def efunc(name, result, *args):
    fn = getattr(egl, name); fn.restype = result; fn.argtypes = args; return fn
p, i, u, f = C.c_void_p, C.c_int, C.c_uint, C.c_float
proc = efunc('eglGetProcAddress', p, C.c_char_p)
def gl(name, result, *args):
    address = proc(name.encode()); assert address, name
    return C.CFUNCTYPE(result, *args)(address)
get_display = C.CFUNCTYPE(p, u, p, C.POINTER(i))(proc(b'eglGetPlatformDisplayEXT'))
display = get_display(0x31DD, None, None)
assert efunc('eglInitialize', u, p, C.POINTER(i), C.POINTER(i))(display, None, None)
assert efunc('eglBindAPI', u, u)(0x30A0)  # OpenGL ES
attrs = (i*15)(0x3033,1,0x3040,4,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038,0,0)
config, count = p(), i()
assert efunc('eglChooseConfig',u,p,C.POINTER(i),C.POINTER(p),i,C.POINTER(i))(display,attrs,C.byref(config),1,C.byref(count)) and count.value
side = 256
surface = efunc('eglCreatePbufferSurface',p,p,p,C.POINTER(i))(display,config,(i*5)(0x3057,side,0x3056,side,0x3038))
context = efunc('eglCreateContext',p,p,p,p,C.POINTER(i))(display,config,None,(i*3)(0x3098,2,0x3038))
assert surface and context
assert efunc('eglMakeCurrent',u,p,p,p,p)(display,surface,surface,context)
shader_source = (pathlib.Path(__file__).resolve().parent.parent/'ui/rafiMaterialShader.ts').read_text()
shaders=[]
for name, kind in [('materialVertexShader',0x8B31),('materialFragmentShader',0x8B30)]:
    source = re.search(r'export const '+name+r' = `([\s\S]*?)`;',shader_source).group(1).encode()
    shader = gl('glCreateShader',u,u)(kind); shaders.append(shader)
    source_ptr = C.c_char_p(source)
    gl('glShaderSource',None,u,i,C.POINTER(C.c_char_p),C.POINTER(i))(shader,1,C.byref(source_ptr),None)
    gl('glCompileShader',None,u)(shader)
    ok=i(); gl('glGetShaderiv',None,u,u,C.POINTER(i))(shader,0x8B81,C.byref(ok))
    log=C.create_string_buffer(4096); gl('glGetShaderInfoLog',None,u,i,C.POINTER(i),p)(shader,4096,None,log)
    assert ok.value, log.value.decode()
program=gl('glCreateProgram',u)()
for shader in shaders: gl('glAttachShader',None,u,u)(program,shader)
gl('glLinkProgram',None,u)(program)
ok=i(); gl('glGetProgramiv',None,u,u,C.POINTER(i))(program,0x8B82,C.byref(ok)); assert ok.value
gl('glUseProgram',None,u)(program)
vertices=(f*12)(-1,-1,1,-1,-1,1,-1,1,1,-1,1,1)
location=gl('glGetAttribLocation',i,u,C.c_char_p)(program,b'position')
gl('glEnableVertexAttribArray',None,u)(location)
gl('glVertexAttribPointer',None,u,i,u,u,i,p)(location,2,0x1406,0,0,C.cast(vertices,p))
gl('glViewport',None,i,i,i,i)(0,0,side,side)
uniforms={key:gl('glGetUniformLocation',i,u,C.c_char_p)(program,key.encode()) for key in ['time','flow','breath','tension','contact','compact']}
def render(time=0, flow=0, breath=0, contact=(0,0,0), compact=0):
    for key,value in {'time':time,'flow':flow,'breath':breath,'tension':1,'compact':compact}.items():
        gl('glUniform1f',None,i,f)(uniforms[key],value)
    gl('glUniform3f',None,i,f,f,f)(uniforms['contact'],*contact)
    gl('glDrawArrays',None,u,i,i)(4,0,6); gl('glFinish',None)()
    output=(C.c_ubyte*(side*side*4))()
    gl('glReadPixels',None,i,i,i,i,u,u,p)(0,0,side,side,0x1908,0x1401,output)
    assert gl('glGetError',u)()==0
    return bytes(output)
base=render(); flowing=render(time=6,flow=6); breathing=render(time=2,breath=0.012)
touched=render(contact=(0.35,-0.2,0.7)); compact=render(flow=6,compact=1)
interior=[k for k in range(0,len(base),4) if base[k+3]==255]
changed=lambda a,b,indices: sum(max(abs(a[k+c]-b[k+c]) for c in range(3))>2 for k in indices)
flow_changes=changed(base,flowing,interior)
assert flow_changes>len(interior)*0.04, 'internal material is frozen'
assert all(base[k]==flowing[k] for k in range(3,len(base),4)), 'internal flow should not be global scale'
alpha_changes=sum(base[k]!=breathing[k] for k in range(3,len(base),4))
assert alpha_changes>100, 'shader outline deformation is frozen'
near=[];far=[]
for k in interior:
    pixel=k//4; x=((pixel%side+.5)/side*2-1)*1.095; y=((pixel//side+.5)/side*2-1)*1.095
    (near if (x-.35)**2+(y+.2)**2<.25 else far).append(k)
diff=lambda indices:statistics.mean(sum(abs(base[k+c]-touched[k+c]) for c in range(3)) for k in indices)
near_change,far_change=diff(near),diff(far)
assert near_change>1 and near_change>far_change*2, 'touch must displace local surface normals'
assert render()==base, 'touch release must restore equilibrium deterministically'
assert changed(base,compact,interior)>500, 'compact shader must also move'
report={'status':'PASS','scope':'offscreen GLES shader execution; not Android physical certification','resolution':[side,side],
        'shader_compile_link':True,'flow_changed_interior_pixels':flow_changes,'flow_alpha_unchanged':True,
        'breath_deformed_outline_pixels':alpha_changes,'touch_local_difference':round(near_change,3),
        'touch_remote_difference':round(far_change,3),'equilibrium_restored':True,'compact_motion':True}
gl('glDeleteProgram',None,u)(program)
for shader in shaders:gl('glDeleteShader',None,u)(shader)
efunc('eglMakeCurrent',u,p,p,p,p)(display,None,None,None)
assert efunc('eglDestroyContext',u,p,p)(display,context)
assert efunc('eglDestroySurface',u,p,p)(display,surface)
assert efunc('eglTerminate',u,p)(display)
report['context_cleanup']=True
print(json.dumps(report,indent=2))
