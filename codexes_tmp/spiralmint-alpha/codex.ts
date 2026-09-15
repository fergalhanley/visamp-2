
const RAD = Math.PI * 2;
const SPIN_TIME = 120000;

const _t = () => {
    let x = performance.now() % SPIN_TIME
    let y = (performance.now() + SPIN_TIME/2) % SPIN_TIME
    y = y > SPIN_TIME/2 ? SPIN_TIME - y : y
    return y / (((Math.sin(y / 20000) * 0.4 + 0.4) * 1000) + 500);
}

class Codex {

    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    private prop: Prop;
    private audata: Audata;
    private THREE: any;
    private camera: any;
    private scene: any;
    private group: any;
    private renderer: any;
    private textures: string[];
    private particles: number = 1024;
    private textureIndex: number = 0;

    constructor(imports: CodexImports) {
        this.ctx = imports.ctx;
        this.audata = imports.audata;
        this.prop = imports.prop;
        this.THREE = imports.THREE;
        this.textures = [
            imports.assets.images.cube,
            imports.assets.images.cube2,
            imports.assets.images.leo,
            imports.assets.images.star,
            imports.assets.images.bubble,
            imports.assets.images.face2,
            imports.assets.images.circle,
            imports.assets.images.cactus,
            imports.assets.images.ball,
            imports.assets.images.face,
            imports.assets.images.flower,
        ];
        this.init();
    }

    private init() {

        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera = new this.THREE.PerspectiveCamera( 60, width / height, 1, 20000 );
        this.camera.position.z = 1500;

        this.scene = new this.THREE.Scene();

        // create sprites

        const textureLoader = new this.THREE.TextureLoader();

        this.textureIndex = this.prop.get("custom_texture_select");
        const mapB = textureLoader.load( this.textures[this.textureIndex] );

        this.group = new this.THREE.Group();

        const materialTemplate = new this.THREE.SpriteMaterial( {
            map: mapB,
            color: 0xffffff,
        });

        let angle = 0;
        let angleStep = 1;

        for (let i = 1; i <= this.particles; i ++) {

            angle += angleStep;
            angleStep *= 0.999;
            const x = Math.sin(angle);
            const y = Math.cos(angle);
            const z = 0;

            const material = materialTemplate.clone();

            material.color.setHSL( 0.5 * Math.random(), 0.75, 0.5 );
            material.map.offset.set( - 0.5, - 0.5 );
            material.map.repeat.set( 2, 2 );

            const sprite = new this.THREE.Sprite( material );

            sprite.position.set( x, y, z );
            sprite.position.normalize();
            sprite.position.multiplyScalar( angle );

            this.group.add( sprite );

        }

        this.scene.add( this.group );

        // renderer
        this.renderer = new this.THREE.WebGLRenderer({
            canvas: this.ctx.canvas,
        });
        this.renderer.setPixelRatio( 1 );
        this.renderer.setSize( window.innerWidth, window.innerHeight );
    }

    public update() {
        this.setCameraSate();

        const time = _t();
        const timeDomainData = this.audata.getTimeDomainData();

        if (this.textureIndex !== this.prop.get("custom_texture_select")) {
            this.textureIndex = this.prop.get("custom_texture_select");
            this.updateMaterial();
        }
        let sprite;
        let material;
        let ti;
        let light;
        let g;
        let d;

        let angle = 0;
        let angleStep = Math.cos(time / 100) * 0.5 + 0.1;

        for (let i = 0, l = this.group.children.length; i < l; i ++ ) {

            sprite = this.group.children[ i ];
            material = sprite.material;

            ti = i < 512 ? 512 - i : i - 512;
            light = (Math.pow(timeDomainData[ti], 2) / 512) + 20;
            material.color.setHSL( (i/10 % 180 + 90)/(time), 1.0, light/256 );

            g = Math.sin(time/3) * 5 + 10;
            d = (Math.sin(i / (this.particles/(time*10))) * g + g) / 6;

            sprite.material.rotation += 0.05 * ( i / l );
            sprite.scale.set( 64 * d, 64 * d, 1.0 );

            angle += angleStep;
            const x = Math.sin(angle);
            const y = Math.cos(angle);
            sprite.position.set( x, y, 0 );
            sprite.position.normalize();
            sprite.position.multiplyScalar(angle * 3);
        }

        const rotateTime = Date.now() / 20000;
        this.group.rotation.x = -rotateTime;
        // this.group.rotation.y = time * 0.075;
        // this.group.rotation.z = time * 0.1;

        this.renderer.clear();
        this.renderer.render( this.scene, this.camera );
    }

    public resize(width: number, height: number) {
        this.width = width;
        this.height = height;

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
