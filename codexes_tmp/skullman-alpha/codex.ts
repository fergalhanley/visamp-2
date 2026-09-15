
const RAD = Math.PI * 2;

class Codex {

    private ctx: CanvasRenderingContext2D;
    private prop: Prop;
    private audata: Audata;
    private THREE: any;
    private camera: any;
    private scene: any;
    private group: any;
    private renderer: any;
    private textures: string[];
    private textureIndex: number = 1;
    private verticesArray: any;
    private loudArray: any;
    private verticies: any;
    private geometry: any;
    private colorsArray: any;
    private sizeArray: any;
    private vo = 0;
    private vs = 1;
    private vc = 20;
    private points: any;
    private waveformSoundByte?: Uint8Array;
    private color: any;
    private posAttr: any;
    private aSize: any;
    private aColor: any;
    private posArray: Float32Array;
    private sizeArr: Float32Array;
    private colorArr: Float32Array;

    constructor(imports: CodexImports) {
        this.ctx = imports.ctx;
        this.audata = imports.audata;
        this.prop = imports.prop;
        this.THREE = imports.THREE;
        this.verticesArray = imports.assets.models.skull;
        this.textures = [
            imports.assets.images.ball,
            imports.assets.images.cactus,
            imports.assets.images.circle,
            imports.assets.images.cube,
            imports.assets.images.face,
            imports.assets.images.face2,
            imports.assets.images.face3,
            imports.assets.images.flower,
            imports.assets.images.star,
            imports.assets.images.bubble,
            imports.assets.images.leo,
        ];
        this.init();
    }

    private init() {

        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera = new this.THREE.PerspectiveCamera(60, width / height, 1, 5000);
        this.camera.position.z = 1500;

        this.scene = new this.THREE.Scene();

        // create sprites

        const textureLoader = new this.THREE.TextureLoader();

        this.geometry = new this.THREE.BufferGeometry();

        this.textureIndex = this.prop.get("custom_texture_select");
        const sprite = textureLoader.load( this.textures[this.textureIndex] );

        this.verticies = new Float32Array(this.verticesArray.map( v => v * 500));
        this.geometry.setAttribute("position", new this.THREE.Float32BufferAttribute(this.verticies, 3));
        
        const vCount = this.verticies.length / 3;
        this.sizeArray  = new Float32Array(vCount);
        this.colorsArray = new Float32Array(vCount * 3);

        this.geometry.setAttribute("aSize",  new this.THREE.Float32BufferAttribute(this.sizeArray, 1));
        this.geometry.setAttribute("aColor", new this.THREE.Float32BufferAttribute(this.colorsArray, 3));
        
        const material = new this.THREE.ShaderMaterial({
            uniforms: {
                uMap: { value: sprite }
            },
            vertexColors: true,
            // transparent: true,
            depthTest: true,
            blending: this.THREE.AdditiveBlending,
            vertexShader: /* glsl */`
    attribute float aSize;
    attribute vec3  aColor;
    varying vec3 vColor;
    void main() {
      vColor = aColor;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      float atten = 300.0 / -mvPosition.z;
      gl_PointSize = aSize * atten;
    }
  `,
            fragmentShader: /* glsl */`
    uniform sampler2D uMap;
    varying vec3 vColor;
    void main() {
      vec4 tex = texture2D(uMap, gl_PointCoord);
      vec4 c = vec4(vColor, 1.0) * tex;
      if (c.a < 0.1) discard;
      gl_FragColor = c;
    }
  `
        });
        // material.color.setHSL( 1.0, 0.2, 0.5 );

        this.points = new this.THREE.Points(this.geometry, material);

        this.points.rotation.y = Math.PI;

        this.scene.add( this.points );

        this.renderer = new this.THREE.WebGLRenderer({
            canvas: this.ctx.canvas,
        });
        this.renderer.setPixelRatio( 1 );
        this.renderer.setSize( window.innerWidth, window.innerHeight );

        this.loudArray = new Array(256).fill(0.5);

        this.color = new this.THREE.Color(0xffffff);
    }

    public update() {
        this.setCameraSate();

        const soundBytes = this.audata.getByteFrequencyData();

        // If you later add freeze/thaw props, only update these when not frozen
        this.waveformSoundByte = soundBytes;

        const rx = this.prop.get("three_rotateX") || 0;
        const ry = this.prop.get("three_rotateY") || 0;
        const rz = this.prop.get("three_rotateZ") || 0;
        if (this.points) {
            this.points.rotation.set(rx, ry, rz);
        }

        this.vs++;
        if (this.vs % this.vc === 0) {
            this.vs = 0;
            this.vo++;
            this.vo %= this.sizeArray.length;
        }

        this.posAttr = this.geometry.getAttribute("position") as any;
        this.aSize   = this.geometry.getAttribute("aSize") as any;
        this.aColor  = this.geometry.getAttribute("aColor") as any;

        this.posArray  = this.posAttr.array  as Float32Array;
        this.sizeArr   = this.aSize.array    as Float32Array;
        this.colorArr  = this.aColor.array   as Float32Array;
        
        let loud = 0; 
        for (let i = 0; i < this.waveformSoundByte.length; i++) {
            loud += this.waveformSoundByte[i];
        }
        loud /= this.waveformSoundByte.length;
        loud /= 128;

        this.loudArray.unshift(loud);
        this.loudArray.pop();
        let loudnessY,
            i3,
            ii3,
            vt,
            tx,
            ty,
            tz,
            hue,
            lightness;
        
        for (let i = 0; i < this.sizeArray.length; i++) {

            i3 = i * 3;
            ii3 = ((i + this.vo) % this.sizeArray.length) * 3;
            vt = (1 / this.vc) * this.vs;

            // compute translated position like legacy (walk along the model’s vertex ring)
            tx = this.verticies[ii3]     + (this.verticies[ii3 + 3] - this.verticies[ii3])         * vt;
            ty = this.verticies[ii3 + 1] + (this.verticies[ii3 + 4] - this.verticies[ii3 + 1])     * vt;
            tz = this.verticies[ii3 + 2] + (this.verticies[ii3 + 5] - this.verticies[ii3 + 2])     * vt;

            this.posArray[i3]     = tx;
            this.posArray[i3 + 1] = ty;
            this.posArray[i3 + 2] = tz;

            loudnessY = this.loudArray[Math.floor(Math.abs(ty/20)) % 256];
            
            this.sizeArr[i] = 5 + Math.sqrt(Math.pow(loudnessY, 2)) * this.prop.get("custom_prop_radius") * 60;

            // per-vertex color reactivity (works now)
            hue = i % 400 / 400;
            lightness = loud / 2 + 0.2;
            this.color.setHSL(hue, 1, lightness);

            this.colorArr[i3]      = this.color.r;
            this.colorArr[i3 + 1]  = this.color.g;
            this.colorArr[i3 + 2]  = this.color.b;
        }

        this.aSize.needsUpdate = true;
        this.aColor.needsUpdate = true;
        this.posAttr.needsUpdate = true;

        this.renderer.render(this.scene, this.camera);

    }

    public resize(width: number, height: number) {

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize( width, height );
    }

    private updateMaterial() {

        const textureLoader = new this.THREE.TextureLoader();
        const map = textureLoader.load(this.textures[this.textureIndex]);
        const material = new this.THREE.SpriteMaterial({map: map, color: 0xffffff});

        for (let i = 0, l = this.group.children.length; i < l; i ++ ) {

            const sprite = this.group.children[i];
            sprite.material = material;
            sprite.material.needsUpdate = true;
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
