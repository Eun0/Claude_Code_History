export default function ImageBlock({ media_type, data }) {
  const src = `data:${media_type};base64,${data}`
  return (
    <div className="image-block">
      <img src={src} alt="" />
    </div>
  )
}
