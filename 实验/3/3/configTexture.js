/*
 * configTexture.js
 * TODO1：创建 2D 颜色纹理，并从木纹 / 石材图生成切线空间法线贴图。
 * 纹理单元约定：0 = 漫反射贴图，1 = 深度贴图，2 = 环境立方体贴图，
 * 3 = 法线贴图，4 = 地形背景，5 = 地面贴花。
 */

/**
 * TODO1：创建纹理对象并加载纹理图片。
 * 根据 <img> 创建一张可平铺的 RGBA 纹理。
 * 使用 REPEAT + mipmap，并尽量启用各向异性过滤，保证掠射角下的木纹清晰。
 * @param {HTMLImageElement} image
 * @returns {WebGLTexture}
 */
function configureTexture(image) {
  var texture = gl.createTexture();

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  var anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
  if (anisotropy) {
    var maxAnisotropy = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
    gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, maxAnisotropy);
  }

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

/**
 * 从木纹图运行时生成切线空间法线贴图。
 * 先缩到 256×256 并做 5×5 均值模糊，再用 Sobel 求梯度，
 * 这样得到的是板缝尺度的起伏，而不是逐像素的纹理噪声。
 * @param {HTMLImageElement} image
 * @returns {WebGLTexture}
 */
function configureNormalMap(image) {
  var size = 256;
  var canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  var context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, size, size);

  var source = context.getImageData(0, 0, size, size).data;
  var height = new Float32Array(size * size);
  for (var i = 0; i < size * size; i += 1) {
    height[i] = (source[i * 4] * 0.299 + source[i * 4 + 1] * 0.587 + source[i * 4 + 2] * 0.114) / 255.0;
  }

  var blurred = new Float32Array(size * size);
  var radius = 2;
  var taps = (radius * 2 + 1) * (radius * 2 + 1);
  for (var y = 0; y < size; y += 1) {
    for (var x = 0; x < size; x += 1) {
      var sum = 0.0;
      for (var oy = -radius; oy <= radius; oy += 1) {
        var sy = (y + oy + size) % size;
        for (var ox = -radius; ox <= radius; ox += 1) {
          var sx = (x + ox + size) % size;
          sum += height[sy * size + sx];
        }
      }
      blurred[y * size + x] = sum / taps;
    }
  }

  var output = context.createImageData(size, size);
  var strength = MATERIAL_TUNING.normalStrength;
  for (var py = 0; py < size; py += 1) {
    var up = ((py - 1 + size) % size) * size;
    var down = ((py + 1) % size) * size;
    var row = py * size;
    for (var px = 0; px < size; px += 1) {
      var left = (px - 1 + size) % size;
      var right = (px + 1) % size;

      var gx = (blurred[up + left] + 2.0 * blurred[row + left] + blurred[down + left])
        - (blurred[up + right] + 2.0 * blurred[row + right] + blurred[down + right]);
      var gy = (blurred[up + left] + 2.0 * blurred[up + px] + blurred[up + right])
        - (blurred[down + left] + 2.0 * blurred[down + px] + blurred[down + right]);

      var nx = -gx * strength;
      var ny = -gy * strength;
      var nz = 1.0;
      var length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;

      var index = (row + px) * 4;
      output.data[index] = Math.round((nx / length * 0.5 + 0.5) * 255);
      output.data[index + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
      output.data[index + 2] = Math.round((nz / length * 0.5 + 0.5) * 255);
      output.data[index + 3] = 255;
    }
  }
  context.putImageData(output, 0, 0);

  var texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

/**
 * 地面镶嵌环：带 alpha 的局部贴花，用 CLAMP 避免边缘刻度在平铺时重复。
 * @param {HTMLCanvasElement} canvas
 * @returns {WebGLTexture}
 */
function configureDecalTexture(canvas) {
  var texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

