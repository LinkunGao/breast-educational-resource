<template>
  <!-- <div class="w-full h-full border-l border-rose-300 p-4"> -->
  <div class="w-full h-full r_main relative">
    <div class="absolute flex  justify-center items-center top-0 right-0 w-full h-11 p-1 my-2">
      <span class="text-black text-base font-thin">{{ modelControl }}</span>
    </div>

    <div class="hidden md:flex absolute w-full top-24 flex justify-center items-center text-gray-950 text-xs">
      <div class="w-11/12 text-justify" v-html="rightPanelText[modelName]"></div>
    </div>

    <div ref="rightContainer" class="w-full h-full" :class="mdAndUp ? 'baseDom-md' : 'baseDom-sm'">
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      modelControl: "3D MRI",
      Copper: null,
      THREE: null,
      baseRenderer: null,
      baseContainer: null,
      nrrdMaxIndex:-1,
      nrrdSliceZ:null,
      nrrdMeshes: null,
      modelData: null,
      modelToScenes:{},
      modelName: null,
      rightPanelText: {},
      mouseActions: null,
      boundingBoxIndex: 0,
      modelUrlsArray:{
        normal: [
          "modelView/density-1/right/mri.nrrd",
          "modelView/density-1/right/mri_view.json",
        ],
        density_1: [
          "modelView/density-1/right/mri.nrrd",
          "modelView/density-1/right/mri_view.json",
        ],
        density_2: [
          "modelView/density-2/right/mri.nrrd",
          "modelView/density-2/right/mri_view.json",
        ],
        density_3: [
          "modelView/density-3/right/mri.nrrd",
          "modelView/density-3/right/mri_view.json",
        ],
        density_4: [
          "modelView/density-4/right/mri.nrrd",
          "modelView/density-4/right/mri_view.json",
        ],
        benign_cyst: [
        "modelView/benign-cyst/right/mri.nrrd",
        "modelView/benign-cyst/right/mri_view.json",
        ],
        benign_fibroadenoma:[
          "modelView/benign-fib/right/mri.nrrd",
          "modelView/benign-fib/right/mri_view.json",
        ],
        benign_calcifications:[
          "modelView/density-1/right/mri.nrrd",
          "modelView/density-1/right/mri_view.json",
        ],
        cancer_dcis:[
          "modelView/cancer-dcis/right/mri.nrrd",
          "modelView/cancer-dcis/right/mri_view.json",
        ],
        cancer_lobular:[
          "modelView/cancer-lobular/right/mri.nrrd",
          "modelView/cancer-lobular/right/mri_view.json",
        ],
        cancer_ductal:[
          "modelView/cancer-ductal/right/mri.nrrd",
          "modelView/cancer-ductal/right/mri_view.json",
        ]
      },
    };
  },
  computed: {
    mdAndUp() {
      return this.$breakpoint.mdAndUp;
    },
  },
  mounted() {
    this.Copper = this.$Copper();
    this.THREE = this.$three();
    this.raycaster = this.$raycaster();
    this.modelToScenes = this.$modelToScenes();
    this.baseRenderer = this.$baseRightRenderer();
    this.baseContainer = this.$baseRightContainer();
    this.modelData = this.$modelData();
    this.container = this.$refs.rightContainer;
    this.rightPanelText = this.$rightPanelText();
    this.nrrdImages = this.$nrrdImages();
    this.previoursCameras = this.$previoursCameras();
    

    this.container.appendChild(this.baseContainer);
    // Write code after mount this component
    this.modelName = this.$model().name;
    this.boundingBoxIndex = this.$rightBoundingBoxIndex()[this.modelName];
    
    this.start();

    window.addEventListener("resize", () => {
      setTimeout(() => {
        if (!!this.scene) this.scene.onWindowResize();
      }, 500);
    });
  },

  methods: {
    start() {
      this.loadNrrd(this.modelUrlsArray[this.modelName][0], this.modelName+"right_mri");
    },

    loadNrrd(nrrdUrl, modelName) {
      const viewURL = this.modelUrlsArray[this.modelName][1];
      const loadBar1 = this.Copper.loading("loading/loading.svg");
      
      this.scene = this.baseRenderer.getSceneByName(modelName);
      if (this.scene === undefined) {
        this.scene = this.baseRenderer.createScene(modelName);
        // this.scene.controls.staticMoving = true;
        this.scene.controls.rotateSpeed = 3.0;
        this.scene.controls.minDistance = 250;
        this.scene.controls.maxDistance = 1000;
        this.scene.controls.panSpeed = 0.5;
        this.baseRenderer.setCurrentScene(this.scene);

        this.scene.loadNrrd(
          nrrdUrl,
          loadBar1,
          true,
          (volume, nrrdMesh, nrrdSlices, gui) => {

            this.nrrdMeshes = nrrdMesh;
            this.scene.addObject(nrrdMesh.z);
            
            const nrrdOrigin = volume.header.space_origin.map((num) => Number(num));
            const nrrdRas = volume.RASDimensions; 

            const x_bias = -(nrrdOrigin[0] * 2 + nrrdRas[0]) / 2;
            const y_bias = -(nrrdOrigin[1] * 2 + nrrdRas[1]) / 2;
            const z_bias = -(nrrdOrigin[2] * 2 + nrrdRas[2]) / 2;

            this.nrrdMaxIndex = nrrdSlices.z.MaxIndex;
            this.nrrdSliceZ = nrrdSlices.z;

            if(this.boundingBoxIndex !== 0){
              this.nrrdSliceZ.index = this.boundingBoxIndex * this.nrrdSliceZ.volume.spacing[2];
              this.nrrdSliceZ.repaint.call(this.nrrdSliceZ);
            }

            this.nrrdImages.push({
                  "image": this.nrrdSliceZ,
                  "initIndex": this.nrrdSliceZ.index,
              })

              // update image window high
              volume.windowHigh = volume.windowHigh / 2;
              volume.repaintAllSlices();
              
            this.nrrdBias = new this.THREE.Vector3(x_bias, y_bias, z_bias);
            // bunding box
            const geometry = new this.THREE.BoxGeometry( nrrdRas[0], nrrdRas[1], nrrdRas[2] ); 
            const material = new this.THREE.MeshBasicMaterial( {color: 0x00ff00} ); 
            const cube = new this.THREE.Mesh( geometry, material ); 
            const box = new this.THREE.BoxHelper( cube, 0xffffff );
            this.scene.scene.add( box );

            if(this.modelUrlsArray[this.modelName].length > 2)
              this.loadModel(this.modelUrlsArray[this.modelName][2]);
            
            const data = {
              nrrdSliceZ: this.nrrdSliceZ, 
              nrrdMesh: this.nrrdMeshes.z, 
              nrrdMaxIndex: this.nrrdMaxIndex
            };
            if(this.modelData[this.modelName] === undefined){
              this.modelData[this.modelName] = {};
            }
            this.modelData[this.modelName]["right"] = data;

            this.addContainerListener();
            this.scene.onWindowResize();
          },
          { openGui: false }
        );

        this.scene.loadViewUrl(viewURL);
        // this.scene.updateBackground("#f8cdd6", "#f8cdd6");
        // this.scene.updateBackground("#fab9c5", "#fab9c5");
        // this.Copper.setHDRFilePath("");
        // this.baseRenderer.updateEnvironment();
        this.modelToScenes[modelName] = this.scene;
      }else{
        this.baseRenderer.setCurrentScene(this.scene);
        setTimeout(() => {
          this.scene.camera.up.set(
            this.previoursCameras["right"][this.modelName]["up"].x,
            this.previoursCameras["right"][this.modelName]["up"].y,
            this.previoursCameras["right"][this.modelName]["up"].z
          );
          this.scene.camera.position.set(
            this.previoursCameras["right"][this.modelName]["position"].x,
            this.previoursCameras["right"][this.modelName]["position"].y,
            this.previoursCameras["right"][this.modelName]["position"].z
          );
          
        }, 300);
        this.addContainerListener();
      }
      this.scene.onWindowResize();
    },

    loadModel(model_url) {
      this.scene.loadOBJ(model_url, (content) => {
        const box = new this.THREE.Box3().setFromObject(content);
        const size = box.getSize(new this.THREE.Vector3()).length();
        const center = box.getCenter(new this.THREE.Vector3());

        // content.position.x += content.position.x - center.x;
        // content.position.y += content.position.y - center.y;
        // content.position.z += content.position.z - center.z;
        content.position.set(this.nrrdBias.x, this.nrrdBias.y, this.nrrdBias.z);
        content.renderOrder = 3;
        content.traverse((child) => {
          if (child.isMesh) {
            child.material = new this.THREE.MeshPhysicalMaterial({
              side: this.THREE.DoubleSide,
              transparent: true,
              opacity: 0.4,
              color: "#a3932a",
              wireframe: false,
            });
          }
        });
      });
      this.scene.onWindowResize();
    },

    addContainerListener() {

      const data = this.modelData[this.modelName]["right"];
      if(this.mouseActions === null){
          this.mouseActions = this.raycaster(this.scene, this.container, data.nrrdSliceZ, data.nrrdMesh, data.nrrdMaxIndex);
        }
      this.container.addEventListener("pointermove", this.mouseActions.mouseMove);
    },
    removeContainerListener() {
      if(this.mouseActions !== null){
        this.container.removeEventListener("pointermove", this.mouseActions.mouseMove);
        this.container.removeEventListener("pointerdown", this.mouseActions.mouseDown);
        this.container.removeEventListener("pointerup", this.mouseActions.mouseUp);
      }
    },
  },
  beforeDestroy() {
    this.previoursCameras["right"][this.modelName] = {
      "up": {
        "x": this.scene.camera.up.x,
        "y": this.scene.camera.up.y,
        "z": this.scene.camera.up.z,
      },
      "position": {
        "x": this.scene.camera.position.x,
        "y": this.scene.camera.position.y,
        "z": this.scene.camera.position.z,
      }
    };
    // Wirte code before destory this component
    this.removeContainerListener();
  },
};
</script>

<style scoped lang="scss">
.r_main{
//   border-radius: 5px;
// background: linear-gradient(145deg, #e26678, #ff798e);
// box-shadow:  20px 20px 60px #d56071,
//              -20px -20px 60px #ff8299;
border-radius: 5px;
// background: #fb718588;
background: linear-gradient(81deg, rgba(254,205,211,0.8) 0%, rgba(253,164,175,0.8) 0%, rgba(251,113,133,0.8) 100%);
box-shadow:  5px 5px 10px #e4949e,
             -5px -5px 10px #ffb4c1;
}
.model-control {
  padding-top: 80px;
  span {
    font-size: 1rem;
    // font-weight: bold;
    width: 100%;
    height: 50px;
    text-align: center;
    color: #000;

  }
  .mri {
    padding: 0;
    width: 500px;
    height: 500px;
  }
}

.baseDom-md {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}
.baseDom-sm {
  width: 100vw;
  height: 100vw;
  margin: 0;
  padding: 0;
}
</style>
