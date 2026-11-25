export function ShowroomLights() {
  return <>
    <hemisphereLight args={["#f2e9da", "#796854", .78]} />
    <directionalLight position={[-6, 8, -4]} color="#ecf1f6" intensity={0.45} />
    <directionalLight position={[6, 5, 4]} color="#fffbf5" intensity={0.49} />
    {/* Broad light reads on paint and faces without hot reflections on the hood. */}
    <spotLight name="vehicle-key-spot" position={[3, 6.5, 4]} color="#fff1db" intensity={64} angle={0.59} penumbra={0.92} distance={18} decay={2} />
    <spotLight name="vehicle-rim-spot" position={[-4, 5.5, -3]} color="#f2d7b4" intensity={30} angle={0.64} penumbra={0.92} distance={17} decay={2} />
  </>;
}
