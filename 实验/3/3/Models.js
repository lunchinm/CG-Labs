/*
 * Models.js
 * 场景几何生成。与模板的区别：不再把顶点写进全局数组，而是每次都返回
 * 独立的数据包，便于每个绘制程序建立自己的 VAO / VBO，也便于以后新增物体。
 */
var Models = (function () {
  'use strict';

  var QUAD_UV = [
    [0.0, 0.0],
    [0.0, 1.0],
    [1.0, 1.0],
    [1.0, 0.0]
  ];

  function pushVec(target, x, y, z, w) {
    target.push(x, y, z, w);
  }

  function faceNormal(a, b, c) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    var vx = c[0] - b[0], vy = c[1] - b[1], vz = c[2] - b[2];
    var nx = uy * vz - uz * vy;
    var ny = uz * vx - ux * vz;
    var nz = ux * vy - uy * vx;
    var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
    return [nx / len, ny / len, nz / len];
  }

  /**
   * 单位立方体，中心在原点，半边长 size。
   * 顶点顺序沿用模板的六个 quad 定义，保证法线朝外。
   * @param {number} size
   * @returns {{positions:number[], normals:number[], texCoords:number[], count:number}}
   */
  function cube(size) {
    var s = size;
    var vertices = [
      [-s, -s, s],
      [-s, s, s],
      [s, s, s],
      [s, -s, s],
      [-s, -s, -s],
      [-s, s, -s],
      [s, s, -s],
      [s, -s, -s]
    ];

    var positions = [];
    var normals = [];
    var texCoords = [];

    function quad(a, b, c, d) {
      var normal = faceNormal(vertices[a], vertices[b], vertices[c]);
      var order = [a, b, c, a, c, d];
      var uvOrder = [1, 0, 3, 1, 3, 2];

      for (var i = 0; i < order.length; i += 1) {
        var vertex = vertices[order[i]];
        var uv = QUAD_UV[uvOrder[i]];
        pushVec(positions, vertex[0], vertex[1], vertex[2], 1.0);
        pushVec(normals, normal[0], normal[1], normal[2], 0.0);
        texCoords.push(uv[0], uv[1]);
      }
    }

    quad(1, 0, 3, 2); // +Z
    quad(4, 5, 6, 7); // -Z
    quad(2, 3, 7, 6); // +X
    quad(5, 4, 0, 1); // -X
    quad(6, 5, 1, 2); // +Y
    quad(3, 0, 4, 7); // -Y

    return {
      positions: positions,
      normals: normals,
      texCoords: texCoords,
      count: positions.length / 4
    };
  }

  /**
   * 水平地面。按逆时针顺序拆成两个三角形，法线统一朝 +Y。
   * @param {number} halfSize
   * @param {number} height
   * @returns {{positions:number[], normals:number[], texCoords:number[], count:number}}
   */
  function plane(halfSize, height) {
    var s = halfSize;
    var y = height;
    var corners = [
      [s, y, s],
      [-s, y, -s],
      [-s, y, s],
      [s, y, s],
      [s, y, -s],
      [-s, y, -s]
    ];
    var uv = [
      [1.0, 0.0],
      [0.0, 1.0],
      [0.0, 0.0],
      [1.0, 0.0],
      [1.0, 1.0],
      [0.0, 1.0]
    ];

    var positions = [];
    var normals = [];
    var texCoords = [];

    for (var i = 0; i < corners.length; i += 1) {
      var corner = corners[i];
      pushVec(positions, corner[0], corner[1], corner[2], 1.0);
      pushVec(normals, 0.0, 1.0, 0.0, 0.0);
      texCoords.push(uv[i][0], uv[i][1]);
    }

    return {
      positions: positions,
      normals: normals,
      texCoords: texCoords,
      count: corners.length
    };
  }

  return {
    cube: cube,
    plane: plane
  };
}());
