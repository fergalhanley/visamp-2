
const RAD = Math.PI * 2;
const MAX = 512;

class Codex {

    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    private cx: number;
    private cy: number;
    private prop: Prop;
    private audata: Audata;
    private density = 10;
    private divisions = 33;

    constructor(imports: CodexImports) {

        this.ctx = imports.ctx;
        this.audata = imports.audata;
        this.prop = imports.prop;
        this.resize(imports.width, imports.height);
    }

    public update() {

        this.ctx.fillStyle = `rgba(0, 0, 0, ${this.prop.get("custom_prop_clear_opacity")})`;
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.ctx.lineWidth = 2; //this.prop.get("context_2d_line_width") * zoom;

        const td = this.audata.getTimeDomainData();
        const t = performance.now() / 3000;
        
        for (let i = 0; i < MAX; i += this.density) {

            const deg = (performance.now() / MAX * Math.sin((i/3 - MAX / 9) / MAX/3)) % RAD;

            const l = td[i % MAX] / 256 * 100;
            
            this.ctx.strokeStyle = `hsla(${i % 360}, ${100}%, ${l}%, 0.05)`;

            this.ctx.beginPath();
            
            const protrusion = Math.sin(t) / 2;
            
            for (let j = 1; j <= this.divisions; j++) {
                
                // the angle between spikes
                const theta = j / (this.divisions - 1);
                
                // how much the spikes protrude
                const peta = i + i * protrusion * (j % 2);
                
                const px = peta * Math.cos(deg + RAD * theta) + this.cx;
                const py = peta * Math.sin(deg + RAD * theta) + this.cy;

                if (j === 1) {
                    this.ctx.moveTo(px, py);
                } else {
                    this.ctx.lineTo(px, py);
                }
            }
            // this.ctx.lineTo(x1, y1);
            
            this.ctx.stroke();

        }
    }

    public resize(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.cx = this.width / 2;
        this.cy = this.height / 2;
    }
}
    
