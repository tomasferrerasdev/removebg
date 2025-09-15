"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { removeBackground } from "@imgly/background-removal";

type ImageItem = {
  id: string;
  file: File;
  srcUrl: string;
  resultUrl?: string;
  resultBlob?: Blob;
  progress: number;
  status: "pending" | "processing" | "done" | "error";
  errorMessage?: string;
  keepBackground?: boolean;
};

export default function Home() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const hasResults = useMemo(() => items.some((i) => i.resultUrl), [items]);

  function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => {
      const type = f.type.toLowerCase();
      const name = f.name.toLowerCase();
      return (
        type === "image/jpeg" ||
        type === "image/jpg" ||
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg")
      );
    });
    if (list.length === 0) return;
    const newItems: ImageItem[] = list.map((file) => ({
      id: crypto.randomUUID(),
      file,
      srcUrl: URL.createObjectURL(file),
      progress: 0,
      status: "pending",
      keepBackground: false,
    }));
    setItems((prev) => [...prev, ...newItems]);
  }

  async function processSequentially() {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      for (const item of items) {
        if (item.status === "done" || item.status === "processing") continue;
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: "processing", progress: 0 } : i
          )
        );
        try {
          const resultBlob = await removeBackground(item.file, {
            output: { format: "image/png", quality: 0.92 },
            progress: (_stage: string, value: number, total: number) => {
              const percent = total > 0 ? Math.round((value / total) * 100) : 0;
              setItems((prev) =>
                prev.map((i) =>
                  i.id === item.id ? { ...i, progress: percent } : i
                )
              );
            },
          });
          const resultUrl = URL.createObjectURL(resultBlob);
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, resultUrl, resultBlob, progress: 100, status: "done" }
                : i
            )
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to remove background";
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, status: "error", errorMessage: message }
                : i
            )
          );
        }
      }
    } finally {
      setIsProcessing(false);
    }
  }

  useEffect(() => {
    if (items.some((i) => i.status === "pending") && !isProcessing) {
      void processSequentially();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  }

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = "";
  }

  function getBaseName(name: string) {
    return name.replace(/\.[^.]+$/, "");
  }

  function downloadImage(item: ImageItem) {
    const useOriginal = !!item.keepBackground;
    const link = document.createElement("a");
    if (useOriginal) {
      link.href = item.srcUrl;
      link.download = item.file.name;
    } else {
      if (!item.resultBlob) return;
      const url = item.resultUrl ?? URL.createObjectURL(item.resultBlob);
      link.href = url;
      link.download = `${getBaseName(item.file.name)}.png`;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function clearAll() {
    for (const i of items) {
      URL.revokeObjectURL(i.srcUrl);
      if (i.resultUrl) URL.revokeObjectURL(i.resultUrl);
    }
    setItems([]);
  }

  useEffect(() => {
    return () => {
      for (const i of items) {
        URL.revokeObjectURL(i.srcUrl);
        if (i.resultUrl) URL.revokeObjectURL(i.resultUrl);
      }
    };
  }, [items]);

  return (
    <main className="min-h-dvh w-full p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Background Removal</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => inputRef.current?.click()}
            className="px-4 py-2 rounded-md bg-black text-white hover:bg-black/90 disabled:opacity-50"
          >
            Select images
          </button>
          <button
            onClick={clearAll}
            disabled={items.length === 0}
            className="px-4 py-2 rounded-md border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,.jpg,.jpeg"
        multiple
        onChange={onSelect}
        className="hidden"
      />

      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-neutral-300 rounded-xl py-14 cursor-pointer hover:border-neutral-400"
      >
        <span className="text-sm text-neutral-600">
          Drag and drop images here
        </span>
        <span className="text-xs text-neutral-500">
          or click the button to select
        </span>
      </label>

      {items.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-600">
            {items.length} image{items.length > 1 ? "s" : ""} added
          </p>
          <button
            onClick={() => void processSequentially()}
            disabled={isProcessing || items.every((i) => i.status === "done")}
            className="px-3 py-1.5 rounded-md bg-neutral-900 text-white text-sm hover:bg-neutral-800 disabled:opacity-50"
          >
            {isProcessing ? "Processing…" : "Process again"}
          </button>
        </div>
      )}

      {items.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {items.map((item) => (
            <li key={item.id} className="border rounded-lg overflow-hidden">
              <div className="aspect-square grid grid-cols-2">
                <div className="relative bg-neutral-100">
                  {/* Original */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.srcUrl}
                    alt="original"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                </div>
                <div className="relative bg-[conic-gradient(at_1rem_1rem,_#f0f0f0_25%,_transparent_0)_0_0/1rem_1rem]">
                  {/* Result */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {item.keepBackground ? (
                    <img
                      src={item.srcUrl}
                      alt="original (kept)"
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  ) : item.resultUrl ? (
                    <img
                      src={item.resultUrl}
                      alt="result"
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs text-neutral-500">
                        {item.status === "error"
                          ? "Error"
                          : item.status === "processing"
                          ? `${item.progress}%`
                          : "Pending"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm" title={item.file.name}>
                    {item.file.name}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {item.status === "processing" && `${item.progress}%`}
                    {item.status === "done" && "Done"}
                    {item.status === "pending" && "Pending"}
                    {item.status === "error" && (item.errorMessage ?? "Error")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-neutral-700 select-none">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-neutral-300"
                      checked={!!item.keepBackground}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((i) =>
                            i.id === item.id
                              ? { ...i, keepBackground: e.target.checked }
                              : i
                          )
                        )
                      }
                    />
                    Keep background
                  </label>
                  <button
                    onClick={() => downloadImage(item)}
                    disabled={!(item.keepBackground || item.resultUrl)}
                    className="px-3 py-1.5 rounded-md border text-sm border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Download
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {items.some((i) => i.keepBackground || i.resultUrl) && (
        <div>
          <button
            onClick={async () => {
              const zip = new JSZip();
              for (const item of items) {
                try {
                  if (item.keepBackground) {
                    const buf = await item.file.arrayBuffer();
                    zip.file(item.file.name, buf);
                  } else if (item.resultBlob) {
                    const buf = await item.resultBlob.arrayBuffer();
                    const base = item.file.name.replace(/\.[^.]+$/, "");
                    zip.file(`${base}.png`, buf);
                  }
                } catch {
                  // skip
                }
              }
              const blob = await zip.generateAsync({ type: "blob" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "images.zip";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800"
          >
            Download ZIP
          </button>
        </div>
      )}
    </main>
  );
}
