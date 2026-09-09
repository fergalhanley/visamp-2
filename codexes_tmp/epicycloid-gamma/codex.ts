
class Codex {

    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    private prop: Prop;
    private audata: Audata;
    private cx: number;
    private cy: number;
    private r: number;
    private deg: number;

    constructor(imports: CodexImports) {
        this.ctx = imports.ctx;
        this.audata = imports.audata;
        this.prop = imports.prop;
        this.deg = 2 * Math.PI / imports.prop.get("custom_prop_points");
        this.resize(imports.width, imports.height);
    }

    public update() {
        // this.ctx.fillStyle = `rgba(0, 0, 0, ${this.prop.get("custom_prop_clear_opacity")})`;
        // this.ctx.fillRect(0, 0, this.width, this.height);
    
        const t = Date.now() * 0.00004;
        const theta = t % Math.PI * 2;
        const ocil = Math.sin(t) * 10;
        const max = Math.max(   
            this.prop.get("custom_prop_points"),
            Math.abs(this.prop.get("custom_prop_points") * ocil),
        );
        const timeDomainData = this.audata.getTimeDomainData();
        
        let sum = 0;
        for(let i = 0; i < timeDomainData.length; i++){
            sum += timeDomainData[i];
        }
        const level = (sum / 512) / 512;
        
        const zoom = this.prop.get("context_2d_zoom");
        
        const audio_amplitude = this.prop.get("audio_amplitude");
        
        for (let i = 0; i < max; i++) {
    
            let x1 = this.r * zoom * Math.cos(this.deg * i + theta) + this.cx;
            let y1 = this.r * zoom * Math.sin(this.deg * i + theta) + this.cy;
            let x2 = this.r * zoom * Math.cos(this.deg / ocil * i + theta) + this.cx;
            let y2 = this.r * zoom * Math.sin(this.deg / ocil * i + theta) + this.cy;
    
            this.ctx.strokeStyle = this.colorGen(this.width, this.height, x1, y1, timeDomainData[i % 512], 1);
            this.ctx.lineWidth = this.prop.get("context_2d_line_width") * zoom;
            // this.ctx.beginPath();
            // this.ctx.moveTo(x2, y2);
            // this.ctx.lineTo(x1, y1);
            // this.ctx.stroke();
    
            x1 = this.cx + (this.r * zoom * 4 * Math.cos(this.deg / ocil * i));
            y1 = this.cy + (this.r * zoom * 4 * Math.sin(this.deg / ocil * i));
            
            this.ctx.lineWidth = this.prop.get("custom_prop_outer_line_thickness") * zoom;
            this.ctx.beginPath();
            this.ctx.moveTo(x2, y2);
            this.ctx.lineTo(x1, y1);
            this.ctx.stroke();
        }
    }
    
    public resize(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.cx = width / 2;
        this.cy = height / 2;
        this.r = Math.min(width, height);
    }
    
    private colorGen(w: number, h: number, x1: number, y1: number, i: number, level: number): string {
        const red = Math.floor(y1 / h * 256 * level);
        const green = Math.floor(x1 / w * 256 * level);
        const blue = Math.floor(i % 256 * level);
        return "rgb(" + red + ", " + green + ", " + blue + ", 1)";
    }
}
