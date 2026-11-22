import React from 'react'
import { Environment } from "@react-three/drei";
import { useAssetGLTF } from "../../assets/useAssetGLTF";
type GroupProps = React.JSX.IntrinsicElements['group']

export default function TimesSquare(props: GroupProps) {
    const { scene } = useAssetGLTF('/models/city_time_square.glb')
    return <group scale={8.5}>
        <Environment preset="night" />
        <primitive object={scene} {...props} />;
    </group>
}