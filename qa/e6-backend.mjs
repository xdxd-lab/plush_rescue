// Conservative classification of browser-reported WebGL strings, not proof of
// physical GPU execution. A masked or generic string is always unknown.
export function classifyBackend({unmaskedAvailable,unmaskedVendor,unmaskedRenderer,renderer}){
 const raw=[unmaskedVendor,unmaskedRenderer,renderer].filter(Boolean).join(' ');
 if(/swiftshader|llvmpipe|software rasterizer|softpipe|Microsoft Basic Render Driver/i.test(raw))return 'software-or-emulated';
 if(!unmaskedAvailable||!unmaskedVendor||!unmaskedRenderer)return 'unknown';
 if(/WebKit WebGL|generic|masked|unavailable|unknown/i.test(unmaskedRenderer))return 'unknown';
 const hardwareVendor=/\b(Apple|AMD|ATI|NVIDIA|Intel|Qualcomm|ARM|Imagination)\b/i.test(unmaskedVendor);
 const hardwareRenderer=/ANGLE.*(Metal Renderer|Direct3D|Vulkan|OpenGL).*\b(Apple|AMD|ATI|NVIDIA|Intel|Adreno|Mali)\b|\b(Apple M\d|Radeon|GeForce|Intel.*Graphics|Adreno|Mali)\b/i.test(unmaskedRenderer);
 return hardwareVendor&&hardwareRenderer?'hardware-reported':'unknown';
}
