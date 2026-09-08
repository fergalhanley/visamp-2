import { SiteFooter, SiteHeader } from "@/components/site/site-header";
import { UploadForm } from "@/components/audio/upload-form";
export const metadata = { title: "Upload music" };
export default function UploadPage() {
  return (
    <div className="site-page">
      <SiteHeader />
      <main className="site-content max-w-3xl">
        <p className="site-eyebrow">FOR THE MUSIC MAKERS</p>
        <h1>Give your sound a new home.</h1>
        <p>
          Upload your original tracks. We’ll get them ready for a world of
          visuals.
        </p>
        <UploadForm />
      </main>
      <SiteFooter />
    </div>
  );
}
