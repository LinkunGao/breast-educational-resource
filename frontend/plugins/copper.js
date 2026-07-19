import * as Copper from "copper3d";
import * as THREE from "three";

const modelData = {};
const modelToScenes = {};

const container = document.createElement("div");
container.style.width = "100vw";
container.style.height = "100%";
container.style.margin = 0;
container.style.padding = 0;
const guiOpen = false;
const baseRenderer = new Copper.copperRenderer(container, {
  guiOpen,
  camera: true,
  performance: true,
  alpha: true,
  logarithmicDepthBuffer: true,
  light: false,
  controls: "copper3d",
});
if (guiOpen) baseRenderer.gui.closed = true;
baseRenderer.animate();

const leftContainer = document.createElement("div");
leftContainer.style.width = "100%";
leftContainer.style.height = "100%";


const baseLeftRenderer = new Copper.copperRenderer(leftContainer, {
  guiOpen: false,
  // Transparent canvas: the background comes from CSS, like the other two
  // renderers already do. With alpha:false copper drew an opaque vignette.
  alpha: true,
  cameraGui: true,
  performance: true,
  logarithmicDepthBuffer: true,
  light: false,
  controls: "copper3d",
});
baseLeftRenderer.animate();

const rightContainer = document.createElement("div");
rightContainer.style.width = "100%";
rightContainer.style.height = "100%";

const baseRightRenderer = new Copper.copperRenderer(rightContainer, {
  guiOpen: false,
  alpha: true,
  cameraGui: true,
  performance: true,
  logarithmicDepthBuffer: true,
  light: false,
  controls: "copper3d",
});
baseRightRenderer.animate();

function throttle(func, delay) {
  let lastCall = 0;

  return function(...args) {
      const now = Date.now();
      if (now - lastCall >= delay) {
          lastCall = now;
          return func.apply(this, args);
      }
  };
}

const raycaster = (scene, container, nrrdSliceZ, nrrdMesh, nrrdMaxIndex) => {
  let startY = null;
  let endY = null;
  let findMesh = false;
  let userMouseDown = false;
  const mouseDown = (event) => {
    if (event.button === 0) {
      startY = event.clientY;
      userMouseDown = true;
      container.style.cursor = "pointer";
      scene.controls.noRotate = true;
    }
  }

  const mouseUp = (event) => {
    // findMesh = false;
    scene.controls.noRotate = false;
    userMouseDown = false;
    container.style.cursor = "auto";
    // container.removeEventListener("pointerdown", mouseDown);
    // container.removeEventListener("pointerup", mouseUp);
    
  }

  const mouseMove = (event) => {
    const a = scene.pickSpecifiedModel(nrrdMesh, {x: event.offsetX, y: event.offsetY});
    let distance = 0;


    if (userMouseDown) {
      endY = event.clientY; 
      const to = endY - startY;
      if(to > 0){
        distance = 1 * nrrdSliceZ.volume.spacing[2];
      }else{
        distance = -1 * nrrdSliceZ.volume.spacing[2];
      }
      
      let index = nrrdSliceZ.index/nrrdSliceZ.volume.spacing[2];
      index += distance;
      
      if (index > nrrdMaxIndex) index = nrrdMaxIndex;
      if (index < 0) index = 0;
      
      nrrdSliceZ.index = index * nrrdSliceZ.volume.spacing[2];
      nrrdSliceZ.repaint.call(nrrdSliceZ);
      startY = endY;
    }

    if(!!a.intersectedObject){
      if(!findMesh){
        container.addEventListener("pointerdown", mouseDown);
        container.addEventListener("pointerup", mouseUp);
      }
      findMesh = true;
    }else{
      findMesh = false;
      // scene.controls.noRotate = false;
      // userMouseDown = false;
      // container.style.cursor = "auto";
      container.removeEventListener("pointerdown", mouseDown);
      // container.removeEventListener("pointerup", mouseUp);
    }
  }
  return {mouseMove, mouseDown, mouseUp};
}

export default (context, inject) => {
  inject("baseRenderer", () => {
    return baseRenderer;
  }),
  inject("baseContainer", () => {
    return container;
  }),
  inject("baseLeftRenderer", () => {
    return baseLeftRenderer;
  }),
  inject("baseLeftContainer", () => {
    return leftContainer;
  }),
  inject("baseRightRenderer", () => {
    return baseRightRenderer;
  }),
  inject("baseRightContainer", () => {
    return rightContainer;
  }),
  inject("modelData", () => {
    return modelData;
  }),
  inject("modelToScenes", () => {
    return modelToScenes;
  }),
  inject("three", () => {
    return THREE;
  }),
  inject("Copper", () => {
    return Copper;
  });
  inject("raycaster", () => {
    return raycaster;
  });
};
