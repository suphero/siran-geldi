import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type ScannerText = { title: string; denied: string; fail: string; cancel: string };

// Uygulama içi QR okuyucu (ana ekran uygulaması: iPhone'da kamerayla okutulan bağlantı hep tarayıcıda açılır).
// Safari'de BarcodeDetector yok; jsQR yalnızca okuyucu açılınca yüklenir. Kare 640 px'e küçültülüp 150 ms'de bir taranır.
// onCode: okunan metin; işlendiyse true (okuyucu durur), değilse taramaya devam edilir. note: okuyucunun altındaki uyarı.
export function Scanner({ open, onClose, onCode, note, text }: {
  open: boolean; onClose: () => void; onCode: (s: string) => boolean; note?: string; text: ScannerText;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr("");
    let stream: MediaStream | null = null, stopped = false, timer = 0;
    (async () => {
      try {
        const [{ default: jsQR }, s] = await Promise.all([
          import("jsqr"),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }),
        ]);
        stream = s;
        const v = video.current;
        if (stopped || !v) return;
        v.srcObject = s;
        await v.play();
        const c = document.createElement("canvas"), ctx = c.getContext("2d", { willReadFrequently: true })!;
        const scan = () => {
          if (stopped) return;
          if (v.readyState >= 2 && v.videoWidth) {
            const k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
            c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
            ctx.drawImage(v, 0, 0, c.width, c.height);
            const r = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: "dontInvert" });
            if (r?.data && onCode(r.data)) return;
          }
          timer = window.setTimeout(scan, 150);
        };
        scan();
      } catch (e: any) {
        setErr(e?.name === "NotAllowedError" ? text.denied : text.fail);
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-3" showCloseButton={false}>
        <DialogTitle className="text-lg">{text.title}</DialogTitle>
        <div className="relative aspect-square overflow-hidden rounded-lg bg-black">
          <video ref={video} playsInline muted className="size-full object-cover" />
          <div className="pointer-events-none absolute inset-[15%] rounded-xl border-4 border-white/80" />
        </div>
        {(err || note) && <p className="text-sm text-destructive">{err || note}</p>}
        <Button variant="secondary" onClick={onClose}>{text.cancel}</Button>
      </DialogContent>
    </Dialog>
  );
}
