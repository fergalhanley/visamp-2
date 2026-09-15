
const RAD = Math.PI * 2;
const SPIN_TIME = 10000;

const _t = () => {
    let x = performance.now() * 0.0001
    return Math.sin(x) * 3;
}

class Codex {

    private ctx: CanvasRenderingContext2D;
    private prop: Prop;
    private audata: Audata;
    private THREE: any;
    private camera: any;
    private scene: any;
    private renderer: any;
    private width: number;
    private height: number;
    private clock: any;
    private pointclouds;
    private rotateY: any;
    private rotateX: any;
    private pointSize = 0.015;
    private gridWidth = 384;
    private tdBuffer: Uint8Array[];


    constructor(imports: CodexImports) {
        this.ctx = imports.ctx;
        this.audata = imports.audata;
        this.prop = imports.prop;
        this.THREE = imports.THREE;
        this.rotateY = new this.THREE.Matrix4().makeRotationY( 0.003 );
        this.rotateX = new this.THREE.Matrix4().makeRotationX( 0.001236 );
        this.init();
        this.tdBuffer = [];
    }

    private init() {

        this.scene = new this.THREE.Scene();
        this.camera = new this.THREE.PerspectiveCamera( 150, window.innerWidth / window.innerHeight, 0.1, 10000 );
        this.camera.position.set( 0, 5, 0 );
        this.camera.lookAt( this.scene.position );
        this.camera.updateMatrix();

        const pcBuffer = this.generatePointcloud( new this.THREE.Color( 1, 0, 0 ), this.gridWidth, this.gridWidth );
        pcBuffer.scale.set( 25, 10, 25 );
        pcBuffer.position.set( 0, 0, 0 );
        this.scene.add( pcBuffer );

        this.pointclouds = pcBuffer;

        this.renderer = new this.THREE.WebGLRenderer({
            canvas: this.ctx.canvas,
            antialias: true,
        });
        this.renderer.setPixelRatio( window.devicePixelRatio );
        this.renderer.setSize( window.innerWidth, window.innerHeight );
        this.renderer.useLegacyLights = false;
    }

    public update() {

        const t = _t();

        this.camera.applyMatrix4( this.rotateY );
        this.camera.applyMatrix4( this.rotateX );
        this.camera.updateMatrixWorld();

        const td = this.audata.getTimeDomainData();

        for (let i = 0; i < this.gridWidth; i++) {

            for (let j = 0; j < this.gridWidth; j++) {

                const k = (i * this.gridWidth) + j;
                const l = (j * this.gridWidth) + i;

                const positions = this.pointclouds.geometry.attributes.position.array;

                const u = i / this.gridWidth;
                const v = j / this.gridWidth;
                const x = u - 0.5;
                const y = (( Math.cos( t * u * Math.PI * 4 ) + Math.sin( v * Math.PI * 8 ) ) / 20) + 0.1;
                // const y = ( Math.cos( u * Math.PI * 4 ) + Math.sin( v * Math.PI * 8 ) ) / 10;
                const z = v - 0.5;

                positions[ 3 * k ] = x;
                positions[ 3 * k + 1 ] = y;
                positions[ 3 * k + 2 ] = z;

                const colors = this.pointclouds.geometry.attributes.color.array;

                if (td && td[i]) {
                    colors[ 3 * l ] = td[i] / 1024;
                    colors[ 3 * l + 1 ] = td[i] / 1024;
                    colors[ 3 * k + 2 ] = td[i] / 1024;
                }
            }
            this.pointclouds.geometry.attributes.color.needsUpdate = true;
            this.pointclouds.geometry.attributes.position.needsUpdate = true;
        }


        this.renderer.render( this.scene, this.camera );
    }

    public resize(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.renderer.setSize( window.innerWidth, window.innerHeight );
        this.camera.updateProjectionMatrix();
    }

    private generatePointCloudGeometry( color, width, length ) {

        const geometry = new this.THREE.BufferGeometry();
        const numPoints = width * length;

        const positions = new Float32Array( numPoints * 3 );
        const colors = new Float32Array( numPoints * 3 );

        let k = 0;

        for ( let i = 0; i < width; i ++ ) {
            for ( let j = 0; j < length; j ++ ) {

                const u = i / width;
                const v = j / length;
                const x = u - 0.5;
                const y = (( Math.cos( u * Math.PI * 4 ) + Math.sin( v * Math.PI * 8 ) ) / 20) + 0.1;
                // const y = ( Math.cos( u * Math.PI * 4 ) + Math.sin( v * Math.PI * 8 ) ) / 10;
                const z = v - 0.5;

                positions[ 3 * k ] = x;
                positions[ 3 * k + 1 ] = y;
                positions[ 3 * k + 2 ] = z;

                const intensity = ( y + 0.1 ) * 5;
                colors[ 3 * k ] = color.r * intensity;
                colors[ 3 * k + 1 ] = color.g * intensity;
                colors[ 3 * k + 2 ] = color.b * intensity;

                k ++;
            }
        }

        geometry.setAttribute( 'position', new this.THREE.BufferAttribute( positions, 3 ) );
        geometry.setAttribute( 'color', new this.THREE.BufferAttribute( colors, 3 ) );
        geometry.computeBoundingBox();

        return geometry;

    }

    private generatePointcloud( color, width, length ) {
        const geometry = this.generatePointCloudGeometry( color, width, length );
        const material = new this.THREE.PointsMaterial( { size: this.pointSize, vertexColors: true } );
        return new this.THREE.Points( geometry, material );
    }
}
