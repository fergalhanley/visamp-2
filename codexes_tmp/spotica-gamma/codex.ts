
const RAD = Math.PI * 2;

class Codex {

    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    private cx: number;
    private cy: number;
    private layers: number;
    private points: number;
    private tmark: number;
    private interval: number;
    private prop: Prop;
    private audata: Audata;

    constructor(imports: CodexImports) {
        this.ctx = imports.ctx;
        this.audata = imports.audata;
        this.prop = imports.prop;
        this.resize(imports.width, imports.height);
        this.layers = 1024;
        this.points = 6;
        this.tmark = 0;
        this.interval = 250;
    }

    public update() {

        this.ctx.fillStyle = `rgba(0, 0, 0, ${this.prop.get("custom_prop_clear_opacity")})`;
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.ctx.lineWidth = this.prop.get("context_2d_line_width");

        const timeDomainData = this.audata.getTimeDomainData();

        const f = Math.max(this.cx, this.cy) / this.layers;
        
        const t = performance.now() / 100;

        for (let i = 0; i < this.layers; i ++) {
            const deg = f * i;
            
            // const l = td[i % 512] / 256 * 100;
            const ti = i < 512 ? 512 - i : i - 512;
            const l = (Math.pow(timeDomainData[ti], 2) / 512) + 20;
            
            //this.ctx.strokeStyle = `rgba(255, 255, 255, 0.5)`;
            this.ctx.strokeStyle = `hsla(${i/10 % 180 + 90}, ${50}%, ${l}%, 0.5)`;
            // this.ctx.fillStyle = `hsla(${i/10 % 180 + 90}, ${50}%, ${l}%, 0.1)`;

            const x = Math.cos(deg) * deg + this.cx;
            const y = Math.sin(deg) * deg + this.cy;
            
            let g = Math.sin(t / 100) * 5 + 10;
            let d = Math.sin(i / (this.layers/(t/2))) * g + g

            this.ctx.beginPath();
            for (let j = 0; j < this.points * 2 + 1; j++) {
                const ang = RAD / (this.points * 2) * j;
                const len = j % 2 ? d : d / 2;
                const xx = Math.sin(ang) * len + x;
                const yy = Math.cos(ang) * len + y;
                if (j === 0) {
                    this.ctx.moveTo(xx, yy);
                } else {
                    this.ctx.lineTo(xx, yy);
                }
            }
            // this.ctx.fill();
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
    
