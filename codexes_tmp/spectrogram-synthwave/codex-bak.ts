class Codex {

    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    private prop: Prop;
    private audata: Audata;
    private THREE: any;

    private renderer: any;
    private scene: any;
    private camera: any;

    private colorArray: Float32Array;
    private colorSetArray: Float32Array;
    private colorFormArray: Float32Array;

    private gridWidth: number;
    private gridDepth: number;
    private vcount: number;
    private vcap: number;

    private geometries: any[];
    private mesh: any;

    private constants: {
        GEOMETRIES_COUNT: 2,
    };

    constructor(imports: CodexImports) {

        this.ctx = imports.ctx;
        this.audata = imports.audata;
        this.prop = imports.prop;
        this.THREE = imports.THREE;

        this.resize(imports.width, imports.height);
    }

    public update() {

        const timeDomain = this.audata.getTimeDomainData();

        this.setCameraSate();

        let i, j, s, col, l, k = 0;

        for (let g = 0; g < this.constants.GEOMETRIES_COUNT; g++) {
            const geometry = this.geometries[g];

            const position = geometry.getAttribute("position");
            const positionArray = position.array;

            const color = geometry.getAttribute("color");
            const colorArray = color.array;

            for (i = 0; i < positionArray.length; i += 3) {
                if (i >= this.vcap) {
                    s = timeDomain[Math.floor((i - this.vcap) / 6)];
                    l = Math.floor(s / 50 + 25);
                    col = new this.THREE.Color(`hsl(${s}, 100%, ${l}%)`);
                    positionArray[i + 1] = (s - 128) * 20 * (this.prop.get("audio_waveformFactor") - 0.9);
                    this.colorSetArray[i] = col.r;
                    this.colorSetArray[i + 1] = col.g;
                    this.colorSetArray[i + 2] = col.b;
                    colorArray[i] = col.r;
                    colorArray[i + 1] = col.g;
                    colorArray[i + 2] = col.b;
                    this.colorFormArray[k++] = timeDomain[k] / 256 * this.prop.get("audio_colorformFactor") / 5;
                } else {
                    j = i + this.gridWidth * 3;
                    positionArray[i + 1] = positionArray[j + 1] * 0.98;
                    this.colorSetArray[i] = this.colorSetArray[j];
                    this.colorSetArray[i + 1] = this.colorSetArray[j + 1];
                    this.colorSetArray[i + 2] = this.colorSetArray[i + 2];

                    colorArray[i] = this.colorSetArray[i] + this.colorFormArray[i % this.gridDepth];
                    colorArray[i + 1] = colorArray[j + 1];
                    colorArray[i + 2] = colorArray[j + 2];
                }
            }

            color.needsUpdate = true;
            position.needsUpdate = true;

        }

        this.renderer.render(this.scene, this.camera);
    }

    public resize(width: number, height: number) {
        this.width = width;
        this.height = height;

        // the dimensions of the visible grid
        this.gridWidth = 256;
        this.gridDepth = 512;

        // the number of vertices in the vertex array
        this.vcount = this.gridWidth * this.gridDepth * 3;

        // this it the threshold below which the time domain data is injected into the vertex array
        // above this threshold the data is interpolated from the previous row
        this.vcap = this.vcount - this.gridWidth * 3;

        this.renderer = new this.THREE.WebGLRenderer({
            canvas: this.ctx.canvas,
            preserveDrawingBuffer: true
        });

        this.camera = new this.THREE.PerspectiveCamera(140, window.innerWidth / window.innerHeight, 0.1, 20000);

        this.scene = new this.THREE.Scene();

        this.camera.position.y = 600;

        this.colorArray = new Float32Array(this.vcount);
        this.colorSetArray = new Float32Array(this.vcount);
        this.colorFormArray = new Float32Array(this.gridDepth);

        this.geometries = [];

        for (let i = 0; i < this.constants.GEOMETRIES_COUNT; i++) {

            const geometry = new this.THREE.PlaneBufferGeometry(7500, 7500, this.gridWidth - 1, this.gridDepth - 1);
            geometry.rotateX(-Math.PI / 2);
            geometry.setAttribute("color", new this.THREE.BufferAttribute(this.colorArray, 3, 1).setDynamic(true));

            const mesh = new this.THREE.Mesh(geometry, new this.THREE.MeshBasicMaterial({
                color: 0xf0f0f0,
                shading: this.THREE.FlatShading,
                vertexColors: this.THREE.VertexColors
            }));
            this.scene.add(mesh);
            mesh.rotation.y = Math.PI;
            mesh.position.x = i * this.gridWidth;

            this.geometries.push(geometry);
        }
    }

    private setCameraSate() {
        if (this.camera.fov !== this.prop.get("three_fov")) {
            this.camera.fov = this.prop.get("three_fov");
            this.camera.updateProjectionMatrix();
        }
        this.camera.position.x += (this.prop.get("three_cameraX") - this.camera.position.x) / 10;
        this.camera.position.y += (this.prop.get("three_cameraY") - this.camera.position.y) / 10;
        this.camera.position.z += (this.prop.get("three_cameraZ") - this.camera.position.z) / 10;
        const [pitch, yaw] = this.prop.get("three_pitch_yaw");
        this.camera.lookAt(new this.THREE.Vector3(
            this.camera.position.x + Math.sin(pitch) * Math.sin(yaw),
            this.camera.position.y + Math.cos(yaw),
            this.camera.position.z + Math.cos(pitch) * Math.sin(yaw),
        ));
    }
}
