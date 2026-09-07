type ImageLoaderParams = {
  src: string;
  width: number;
  quality?: number;
};

/**
 * En Cloudflare, `next/image` apuntaba a /_vinext/image y lo resolvía el Worker
 * con el binding IMAGES. Al desaparecer el Worker nadie atiende esa ruta, así
 * que las imágenes se dirigen al Image CDN de Netlify, que hace la misma
 * negociación de formato y cachea el resultado en el borde.
 */
export default function netlifyImageLoader({
  src,
  width,
  quality,
}: ImageLoaderParams): string {
  // El endpoint solo acepta rutas relativas del propio sitio salvo que se
  // declaren orígenes remotos en netlify.toml. Aquí todas las imágenes son
  // locales, así que no hace falta esa lista.
  const params = new URLSearchParams({ url: src, w: String(width) });
  if (quality) params.set("q", String(quality));
  return `/.netlify/images?${params.toString()}`;
}
