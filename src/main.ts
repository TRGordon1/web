const canvas = document.querySelector("canvas")!

async function loadImageBitmap(url: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  return await createImageBitmap(blob, { colorSpaceConversion: 'none' });
}

async function web() {
    const GRID_SIZE = 64;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error("No appropriate GPUAdapter found.");
    }

    const device = await adapter.requestDevice();

    const context = canvas.getContext("webgpu")!;
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
    });

    const vertices = new Float32Array([
        //   X,    Y,
          -0.8, -0.8, // Triangle 1 (Blue)
           0.8, -0.8,
           0.8,  0.8,
        
          -0.8, -0.8, // Triangle 2 (Red)
           0.8,  0.8,
          -0.8,  0.8,
        ]);

    const vertexBuffer = device.createBuffer({
        label: "Cell vertices",
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/0, vertices);

    const vertexBufferLayout = {
        arrayStride: 8,
        attributes: [{
          format: "float32x2",
          offset: 0,
          shaderLocation: 0, // Position, see vertex shader
        }],
    };

    const cellShaderModule = device.createShaderModule({
        label: "Cell shader",
        code: `
        
        struct OurVertexShaderOutput {
          @builtin(position) position: vec4f,
          @location(0) texcoord: vec2f,
        };
  
        @vertex fn vs(
          @builtin(vertex_index) vertexIndex : u32
        ) -> OurVertexShaderOutput {
          let pos = array(
            // 1st triangle
            vec2f( 0.0,  0.0),  // center
            vec2f( 1.0,  0.0),  // right, center
            vec2f( 0.0,  1.0),  // center, top
  
            // 2st triangle
            vec2f( 0.0,  1.0),  // center, top
            vec2f( 1.0,  0.0),  // right, center
            vec2f( 1.0,  1.0),  // right, top
          );
  
          var vsOutput: OurVertexShaderOutput;
          let xy = pos[vertexIndex];
          vsOutput.position = vec4f(xy, 0.0, 1.0);
          vsOutput.texcoord = xy;
          return vsOutput;
        }
  
        @group(0) @binding(0) var ourSampler: sampler;
        @group(0) @binding(1) var ourTexture: texture_2d<f32>;
  
        @fragment fn fs(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {
          return textureSample(ourTexture, ourSampler, fsInput.texcoord);
        }
        `
    });


    // const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
    // const uniformBuffer = device.createBuffer({
    //     label: "Grid Uniforms",
    //     size: uniformArray.byteLength,
    //     usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    // });
    // device.queue.writeBuffer(uniformBuffer, 0, uniformArray);


    

      // Create the bind group layout and pipeline layout.


    

    const cellPipeline = device.createRenderPipeline({
        label: "Cell pipeline",
        layout: "auto",
        vertex: {
          module: cellShaderModule,
          entryPoint: "vs",
          buffers: [vertexBufferLayout] as Iterable<GPUVertexBufferLayout>
        },
        fragment: {
          module: cellShaderModule,
          entryPoint: "fs",
          targets: [{
            format: canvasFormat
          }]
        }
      });

  const url = '/src/test.png';
  const source = await loadImageBitmap(url);
  const texture = device.createTexture({
    label: url,
    format: 'rgba8unorm',
    size: [source.width, source.height],
    usage: GPUTextureUsage.TEXTURE_BINDING |
           GPUTextureUsage.COPY_DST |
           GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source, flipY: true },
    { texture },
    { width: source.width, height: source.height },
  );

  const sampler = device.createSampler({
    addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'linear',
  });

      const bindGroup = device.createBindGroup({
          label: "Cell renderer bind group A",
          layout: cellPipeline.getBindGroupLayout(0), // Updated Line
          entries: [{
            binding: 0,
            resource: sampler
          },{
            binding: 1,
            resource: texture.createView()
          }],
        })
      
    
    const UPDATE_INTERVAL = 0; // Update every 200ms (5 times/sec)
    let step = 0; // Track how many simulation steps have been run

    function updateGrid() {
    
    // Start a render pass 
    const encoder = device.createCommandEncoder();
    
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: "clear",
        clearValue: { r: 0, g: 0, b: 0.4, a: 1.0 },
        storeOp: "store",
        }]
    });
    
    // Draw the grid.
    pass.setPipeline(cellPipeline);
    pass.setBindGroup(0, bindGroup); // Updated!
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);
    
    // End the render pass and submit the command buffer
    pass.end();
    device.queue.submit([encoder.finish()]);
    step++; // Increment the step count

    }
    
    // Schedule updateGrid() to run repeatedly
    setInterval(updateGrid, UPDATE_INTERVAL);

}

web()
