<template>
  <div class="model h-full relative">
      <v-tabs class="absolute  flex justify-center tab-main" @change="tabsOnChange">
        <v-tab class="tab-sub w-40">{{ tab1 }}</v-tab>
        <v-tab v-show="tab2==='2D Ultrasound'? true : false" class="tab-sub w-40">{{ tab2 }}</v-tab>
      </v-tabs>

    <div class="hidden md:flex absolute w-full top-24 flex justify-center items-center text-gray-950 text-xs">
      <div class="w-1/4 text-justify z-50" v-html="middlePanelText[modelName]"></div>
    </div>
    
    <div ref="baseDomObject" class="h-full" :class="mdAndUp ? 'baseDom-md' : 'baseDom-sm'" />
    
    <div class="md:hidden flex fixed bottom-36 right-5 cursor-pointer custom-z-index">
      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
      <v-avatar color="pink lighten-2" @click="onResetAllModelsView">
        <v-icon dark>
          mdi-refresh
        </v-icon>
      </v-avatar>
    </div>
    
    <div
        ref="threeDControls"
        class="hidden baseModelControl md:flex"
        :class="mdAndUp ? 'baseModelControl-md' : 'baseModelControl-sm'"
      >
        <div class="baseModelCB" :class="mdAndUp ? 'baseModelCB-md' : ''">
          <button
            class="absolute top-0 left-0 w-1/4 h-full hover:bg-zinc-700/30 rounded-lg"
            @click="onResetAllModelsView"
          />
          <img
            src="~/assets/images/gestures-icons.png"
            class="h-full w-full md:object-contain"
          />
        </div>
      </div>
  </div>
</template>

<script>
import loadingSvg from "~/assets/images/loading/loading.svg";
export default {
  data() {
    return {
      Copper: null,
      THREE: null,
      baseRenderer: null,
      baseContainer: null,
      container: null,
      modelData: null,
      nrrdMaxIndex:-1,
      nrrdSliceZ:null,
      nrrdMeshes: null,
      loadFirstTime: true,
      tab1: "3D Mammogram",
      tab2: "2D Mammogram",
      currentView: "3D Mammogram",
      mouseActions: null,
      modelName: null,
      middlePanelText: {},
      modelToScenes:{},
      modelUrlsArray:{
        normal: [
          "modelView/density-1/middle/m3d.nrrd",
          "modelView/density-1/middle/m_view.json",
          "modelView/density-1/middle/m2d.nrrd"
        ],
        density_1: [
          "modelView/density-1/middle/m3d.nrrd",
          "modelView/density-1/middle/m_view.json",
          "modelView/density-1/middle/m2d.nrrd"
        ],
        density_2: [
          "modelView/density-2/middle/m3d.nrrd",
          "modelView/density-2/middle/m_view.json",
          "modelView/density-2/middle/m2d.nrrd"
        ],
        density_3: [
          "modelView/density-3/middle/m3d.nrrd",
          "modelView/density-3/middle/m_view.json",
          "modelView/density-3/middle/m2d.nrrd"
        ],
        density_4: [
          "modelView/density-4/middle/m3d.nrrd",
          "modelView/density-4/middle/m_view.json",
          "modelView/density-4/middle/m2d.nrrd"
        ],
        benign_cyst: [
          "modelView/benign-cyst/middle/m3d.nrrd",
          "modelView/benign-cyst/middle/m_view.json",
          "modelView/benign-cyst/middle/u2d.nrrd",
          "modelView/benign-cyst/middle/u_view.json",
        ],
        benign_fibroadenoma:[
          "modelView/benign-fib/middle/m3d.nrrd",
          "modelView/benign-fib/middle/m_view.json",
          "modelView/benign-fib/middle/m2d.nrrd"
        ],
        benign_calcifications:[
          "modelView/density-1/middle/m3d.nrrd",
          "modelView/density-1/middle/m_view.json",
          "modelView/density-1/middle/m2d.nrrd"
        ],
        cancer_dcis:[
          "modelView/cancer-dcis/middle/m3d.nrrd",
          "modelView/cancer-dcis/middle/m_view.json",
          "modelView/cancer-dcis/middle/m2d.nrrd"
        ],
        cancer_lobular:[
          "modelView/cancer-lobular/middle/m3d.nrrd",
          "modelView/cancer-lobular/middle/m_view.json",
          "modelView/cancer-lobular/middle/m2d.nrrd"
        ],
        cancer_ductal:[
          "modelView/cancer-ductal/middle/m3d.nrrd",
          "modelView/cancer-ductal/middle/m_view.json",
          "modelView/cancer-ductal/middle/m2d.nrrd"
        ]
      },
    };
  },

  created: async function () {
    // this.$nuxt.$on("send-emitter-data", (data) => {
    //   console.log(data);
    // });
  },

  computed: {
    mdAndUp() {
      return this.$breakpoint.mdAndUp;
    },
  },

  mounted() {
    this.Copper = this.$Copper();
    this.baseRenderer = this.$baseRenderer();
    this.THREE = this.$three();
    this.raycaster = this.$raycaster();
    this.modelToScenes = this.$modelToScenes();
    this.baseContainer = this.$baseContainer();
    this.modelData = this.$modelData();
    this.container = this.$refs.baseDomObject;
    this.modelName = this.$model().name;
    this.middlePanelText = this.$middlePanelText();
    this.nrrdImages = this.$nrrdImages();
    this.previoursCameras = this.$previoursCameras();

    if(this.modelName === "benign_cyst"){
      this.tab2 = "2D Ultrasound";
    }else{
      this.tab2 = "2D Mammogram";
    }

    this.$nuxt.$emit("onNavChange", this.modelName);

    this.container.appendChild(this.baseContainer);

    // setTimeout(() => {
    //   this.mdAndUp
    //     ? (this.baseContainer.style.height = "100vh")
    //     : (this.baseContainer.style.height = "100vw");
    //   this.container.appendChild(this.baseContainer);
    //   this.start();
    // }, 100);

    this.start();

    window.addEventListener("resize", () => {
      setTimeout(() => {
        this.mdAndUp
          ? (this.baseContainer.style.height = "100vh")
          : (this.baseContainer.style.height = "100vw");

        this.scene.onWindowResize();
      }, 500);
    });
  },

  methods: {
    async start() {
 
      this.loadNrrd(this.modelUrlsArray[this.modelName][0], this.modelName+"middle_3d");
    },

    tabsOnChange(a) {
      if (this.loadFirstTime) return;
      const modelUrl = this.modelUrlsArray[this.modelName][0];
      if (a === 0) {
        this.currentView = "3D Mammogram";
        this.loadNrrd(modelUrl, this.modelName+"middle_3d");
      } else {
        this.currentView = this.modelName === "benign_cyst" ? "2D Ultrasound" : "2D Mammogram";
        this.loadNrrd(this.modelUrlsArray[this.modelName][2], this.modelName+"middle_2d");
      }
    },

    loadNrrd(nrrdUrl, modelName) {
      const viewURL = this.currentView === "2D Ultrasound" ? this.modelUrlsArray[this.modelName][3] : this.modelUrlsArray[this.modelName][1];
      const loadBar1 = this.Copper.loading(loadingSvg);
      const loadBar2 = this.Copper.loading(loadingSvg);
      
      const loadingContainer = loadBar1.loadingContainer;
      loadingContainer.style.position = "fixed";
      loadingContainer.style.top = 0;
      loadingContainer.style.left = 0;
      loadingContainer.style.right = 0;
      loadingContainer.style.bottom = 0;
      loadingContainer.style.display = "flex";
      this.baseContainer.appendChild(loadingContainer);
      loadBar1.progress.innerHTML = "Loading image...";

      this.scene = this.baseRenderer.getSceneByName(modelName);

      if (this.scene === undefined) {
        this.scene = this.baseRenderer.createScene(modelName);
        // this.scene.controls.staticMoving = true;
        this.scene.controls.rotateSpeed = 3.0;
        this.scene.controls.panSpeed = 0.5;
        
        this.baseRenderer.setCurrentScene(this.scene);

          this.scene.loadNrrd(
            nrrdUrl,
            loadBar2,
            true,
            (volume, nrrdMesh, nrrdSlices, gui) => {
              this.nrrdMeshes = nrrdMesh;
              this.nrrdMeshes.x.name = "x";
              this.nrrdMeshes.y.name = "y";
              this.nrrdMeshes.z.name = "z";
              this.scene.addObject(nrrdMesh.z);
              this.nrrdMaxIndex = nrrdSlices.z.MaxIndex;
              this.nrrdSliceZ = nrrdSlices.z;

              // const nrrdOrigin = volume.header.space_origin.map((num) => Number(num));
              const nrrdRas = volume.RASDimensions; 

              const x_bias = -(nrrdRas[0]) / 2;
              const y_bias = -(nrrdRas[1]) / 2;
              const z_bias = -(nrrdRas[2]) / 2;

              this.nrrdMaxIndex = nrrdSlices.z.MaxIndex;
              this.nrrdSliceZ = nrrdSlices.z;

              this.nrrdBias = new this.THREE.Vector3(x_bias, y_bias, z_bias);
              

              if(this.currentView === "2D Mammogram" || this.currentView === "2D Ultrasound"){
                this.scene.controls.noRotate = true;
                this.scene.controls.noPan = true;
                this.removeContainerListener();
              }else{

                this.nrrdImages.push({
                  "image": this.nrrdSliceZ,
                  "initIndex": this.nrrdSliceZ.index,
                })
                // bunding box
                const geometry = new this.THREE.BoxGeometry( nrrdRas[0], nrrdRas[1], nrrdRas[2] ); 
                const material = new this.THREE.MeshBasicMaterial( {color: 0x00ff00} ); 
                const cube = new this.THREE.Mesh( geometry, material ); 
                const box = new this.THREE.BoxHelper( cube, 0xffffff );
                this.scene.scene.add( box );
                const data = {
                  nrrdSliceZ: this.nrrdSliceZ, 
                  nrrdMesh: this.nrrdMeshes.z, 
                  nrrdMaxIndex: this.nrrdMaxIndex
                };
                if(this.modelData[this.modelName] === undefined){
                  this.modelData[this.modelName] = {};
                }
                this.modelData[this.modelName]["middle"] = data;
                this.addContainerListener();
                this.scene.onWindowResize();
                $nuxt.$emit("finishLoad", true);
              }
              loadingContainer.style.display = "none";
            },
            { openGui: false }
          );
        

        this.scene.loadViewUrl(viewURL);
        // this.scene.updateBackground("#f8cdd6", "#f8cdd6");
      
        // this.baseRenderer.updateEnvironment();
        this.modelToScenes[modelName] = this.scene;
      }else{
        loadingContainer.style.display = "none";
        this.baseRenderer.setCurrentScene(this.scene);
        setTimeout(() => {
          this.scene.camera.up.set(
            this.previoursCameras["middle"][this.modelName]["up"].x,
            this.previoursCameras["middle"][this.modelName]["up"].y,
            this.previoursCameras["middle"][this.modelName]["up"].z
          );
          this.scene.camera.position.set(
            this.previoursCameras["middle"][this.modelName]["position"].x,
            this.previoursCameras["middle"][this.modelName]["position"].y,
            this.previoursCameras["middle"][this.modelName]["position"].z
          );
          
        }, 300);
        if(this.currentView === "2D Mammogram"){
            this.scene.controls.noRotate = true;
            this.scene.controls.noPan = true;
            this.removeContainerListener();
          }else{
            this.addContainerListener();
          }
      }
      this.loadFirstTime = false;
      this.scene.onWindowResize();
    },
    addContainerListener() {
      if(!!this.modelData[this.modelName]){
        const data = this.modelData[this.modelName]["middle"];
        if(this.mouseActions === null){
            this.mouseActions = this.raycaster(this.scene, this.container, data.nrrdSliceZ, data.nrrdMesh, data.nrrdMaxIndex);
          }
        this.container.addEventListener("pointermove", this.mouseActions.mouseMove);
      }
    },
    removeContainerListener() {
      if(this.mouseActions !== null){
        this.container.removeEventListener("pointermove", this.mouseActions.mouseMove);
        this.container.removeEventListener("pointerdown", this.mouseActions.mouseDown);
        this.container.removeEventListener("pointerup", this.mouseActions.mouseUp);
      }
    },
    onResetAllModelsView() {

      for (var k in this.modelToScenes) {
        if (this.modelToScenes.hasOwnProperty(k)) {
          this.modelToScenes[k].resetView();
        }
      }
      this.nrrdImages.forEach((nrrdImage) => {
        if(nrrdImage.image.index !== nrrdImage.initIndex){
          nrrdImage.image.index = nrrdImage.initIndex;
          nrrdImage.image.repaint.call(nrrdImage.image);
        }
      });
    },
  },

  watch: {},

  beforeDestroy() {
    // Wirte code before destory this component
    this.previoursCameras["middle"][this.modelName] = {
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
    this.removeContainerListener();
  },
};
</script>

<style scoped lang="scss">
.model {
  background: rgb(251,113,133);
  background: linear-gradient(90deg, rgba(251,113,133,1) 0%, rgba(253,164,175,1) 48%, rgba(251,113,133,1) 100%);
}

.baseDom-md {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
}
.baseDom-sm {
  width: 100vw;
  height: 100vw;
  margin: 0;
  padding: 0;
}

.baseModelControl {
  width: 100vw;
  height: 120px;
  flex-direction: row;
  justify-content: center;
  align-content: center;
  .baseModelCB {
    width: 240px;
    height: 70px;
    position: relative;
  }
  .baseModelCB-md {
    width: 280px;
    height: 100px;
  }
}

.baseModelControl-md {
  position: fixed;
  bottom: 10px;
  // padding-left: 100px;
}
.baseModelControl-sm {
  order: -1;
  height: 60px;
}
.tab-main{
  // background-color: #fb7185 !important;
  // background: rgb(244,63,94) !important;
  background: rgb(251,113,133);
  background: linear-gradient(90deg, rgba(251,113,133,1) 0%, rgba(253,164,175,1) 48%, rgba(251,113,133,1) 100%);
}
.tab-sub{
  color: #000 !important;
  background: #fda4af;
  // background: linear-gradient(90deg, rgba(251,113,133,1) 0%, rgba(253,164,175,1) 48%, rgba(251,113,133,1) 100%);
}
.custom-z-index{
  z-index: 9998;
}
</style>
