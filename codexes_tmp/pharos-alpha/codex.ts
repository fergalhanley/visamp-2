
const RAD = Math.PI * 2;

class Codex {

    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    private cx: number;
    private cy: number;
    private max: number;
    private prop: Prop;
    private audata: Audata;
    private level = {};
    private density = 10;

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
        
        for (let i = 0; i < this.max; i += this.density) {

            const deg = (performance.now() / 500 * Math.sin((i - this.max / 3) / this.max)) % RAD;

            const l = td[i % 512] / 256 * 100;
            
            this.ctx.strokeStyle = `hsla(${i % 360}, ${100}%, ${l}%, 0.05)`;


            const x1 = i * Math.cos(deg) + this.cx;
            const y1 = i * Math.sin(deg) + this.cy;
            const x2 = i * Math.cos(deg + RAD / 3) + this.cx;
            const y2 = i * Math.sin(deg + RAD / 3) + this.cy;
            const x3 = i * Math.cos(deg + (RAD / 3) * 2) + this.cx;
            const y3 = i * Math.sin(deg + (RAD / 3) * 2) + this.cy;

            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.lineTo(x3, y3);
            this.ctx.lineTo(x1, y1);
            this.ctx.stroke();

        }
    }

    public resize(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.cx = this.width / 2;
        this.cy = this.height / 2;
        this.max = Math.max(this.width, this.height);
    }
}
    
