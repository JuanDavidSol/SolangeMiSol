import * as THREE from "three";


/* =====================================================
   RENDERIZADOR
===================================================== */

const container =
    document.getElementById("scene");


const renderer =
    new THREE.WebGLRenderer({

        antialias: true,

        alpha: true

    });


renderer.setPixelRatio(

    Math.min(
        window.devicePixelRatio,
        2
    )

);


renderer.setSize(

    window.innerWidth,

    window.innerHeight

);


renderer.outputColorSpace =
    THREE.SRGBColorSpace;


renderer.toneMapping =
    THREE.ACESFilmicToneMapping;


renderer.toneMappingExposure =
    1.15;


container.appendChild(
    renderer.domElement
);


/* =====================================================
   ESCENA
===================================================== */

const scene =
    new THREE.Scene();


scene.fog =
    new THREE.FogExp2(

        0x100c17,

        0.032

    );


/* =====================================================
   CÁMARA
===================================================== */

const camera =
    new THREE.PerspectiveCamera(

        38,

        window.innerWidth /
        window.innerHeight,

        0.1,

        100

    );


camera.position.set(

    0,

    2.3,

    12

);


camera.lookAt(

    0,

    2.1,

    0

);


/* =====================================================
   ILUMINACIÓN
===================================================== */

const ambient =
    new THREE.HemisphereLight(

        0xffdce9,

        0x10151b,

        2.2

    );


scene.add(
    ambient
);


const mainLight =
    new THREE.DirectionalLight(

        0xffe7f0,

        4

    );


mainLight.position.set(

    -4,

    8,

    7

);


scene.add(
    mainLight
);


const warmLight =
    new THREE.PointLight(

        0xffb7cf,

        10,

        16

    );


warmLight.position.set(

    0,

    4.5,

    3

);


scene.add(
    warmLight
);


const rimLight =
    new THREE.PointLight(

        0x9f78d8,

        4,

        18

    );


rimLight.position.set(

    5,

    4,

    -3

);


scene.add(
    rimLight
);


/* =====================================================
   FLOR
===================================================== */

const flower =
    new THREE.Group();


flower.position.y =
    0.15;


flower.scale.set(
    0.90,
    0.90,
    0.90
);


scene.add(
    flower
);


/* =====================================================
   MATERIAL PÉTALOS EXTERIORES
===================================================== */

const petalMaterial =
    new THREE.MeshPhysicalMaterial({

        color:
            0xf0a4c0,

        roughness:
            0.38,

        metalness:
            0,

        transmission:
            0.10,

        thickness:
            0.38,

        clearcoat:
            0.18,

        clearcoatRoughness:
            0.32,

        sheen:
            0.42,

        sheenColor:
            new THREE.Color(
                0xffd8e6
            ),

        side:
            THREE.DoubleSide

    });


/* =====================================================
   MATERIAL PÉTALOS INTERIORES
===================================================== */

const innerPetalMaterial =
    new THREE.MeshPhysicalMaterial({

        color:
            0xffc7da,

        roughness:
            0.34,

        metalness:
            0,

        transmission:
            0.15,

        thickness:
            0.30,

        clearcoat:
            0.20,

        clearcoatRoughness:
            0.28,

        sheen:
            0.5,

        sheenColor:
            new THREE.Color(
                0xffe9f1
            ),

        side:
            THREE.DoubleSide

    });


/* =====================================================
   TALLO NATURAL
===================================================== */

const stemMaterial =
    new THREE.MeshPhysicalMaterial({

        color:
            0x315b2d,

        roughness:
            0.78,

        metalness:
            0,

        clearcoat:
            0.12

    });


/*
 * Tallo largo:
 * desde abajo de la pantalla
 * hasta debajo de la flor.
 */

const stemCurve =
    new THREE.CatmullRomCurve3([

        new THREE.Vector3(
            0.02,
            -3.10,
            0
        ),

        new THREE.Vector3(
            -0.06,
            -2.10,
            0
        ),

        new THREE.Vector3(
            0.05,
            -1.10,
            0
        ),

        new THREE.Vector3(
            -0.03,
            -0.10,
            0
        ),

        new THREE.Vector3(
            0.04,
            0.85,
            0
        ),

        new THREE.Vector3(
            -0.02,
            1.55,
            0
        ),

        new THREE.Vector3(
            0,
            2.25,
            0
        )

    ]);


const stemGeometry =
    new THREE.TubeGeometry(

        stemCurve,

        70,

        0.055,

        18,

        false

    );


const stem =
    new THREE.Mesh(

        stemGeometry,

        stemMaterial

    );


/*
 * Detrás de la flor.
 */

stem.position.z =
    -0.08;


flower.add(
    stem
);


/* =====================================================
   HOJAS NATURALES
===================================================== */

function createLeaf(
    side,
    height,
    rotation,
    scale
) {


    const shape =
        new THREE.Shape();


    /*
     * Base.
     */

    shape.moveTo(
        0,
        0
    );


    /*
     * Borde superior.
     */

    shape.bezierCurveTo(

        0.45,
        0.18,

        1.25,
        0.50,

        2.05,
        0.18

    );


    /*
     * Punta.
     */

    shape.bezierCurveTo(

        2.25,
        0.08,

        2.38,
        0,

        2.48,
        -0.04

    );


    /*
     * Borde inferior.
     */

    shape.bezierCurveTo(

        2.05,
        -0.16,

        1.20,
        -0.23,

        0.55,
        -0.12

    );


    shape.bezierCurveTo(

        0.25,
        -0.08,

        0.06,
        -0.03,

        0,
        0

    );


    /*
     * Pequeño volumen.
     */

    const geometry =
        new THREE.ExtrudeGeometry(

            shape,

            {

                depth:
                    0.045,

                bevelEnabled:
                    true,

                bevelThickness:
                    0.012,

                bevelSize:
                    0.012,

                bevelSegments:
                    3,

                curveSegments:
                    24

            }

        );


    geometry.center();


    const material =
        new THREE.MeshPhysicalMaterial({

            color:
                0x5b8449,

            roughness:
                0.72,

            metalness:
                0,

            clearcoat:
                0.12,

            side:
                THREE.DoubleSide

        });


    const leaf =
        new THREE.Mesh(

            geometry,

            material

        );


    /*
     * Nacen muy cerca
     * del tallo.
     */

    leaf.position.set(

        side * 0.22,

        height,

        0.35

    );


    /*
     * Inclinación.
     */

    leaf.rotation.z =

        side *

        THREE.MathUtils.degToRad(
            rotation
        );


    leaf.rotation.y =

        side *

        THREE.MathUtils.degToRad(
            12
        );


    leaf.rotation.x =

        THREE.MathUtils.degToRad(
            -8
        );


    /*
     * Estado inicial.
     */

    leaf.scale.set(
        0.01,
        0.01,
        0.01
    );


    flower.add(
        leaf
    );


    return leaf;
}


/* =====================================================
   HOJAS
===================================================== */

const leafLeft =
    createLeaf(

        -1,

        0.65,

        34,

        0.95

    );


const leafRight =
    createLeaf(

        1,

        1.15,

        34,

        0.90

    );


/* =====================================================
   GEOMETRÍA DE PÉTALOS
===================================================== */

function createPetalGeometry(

    width,

    height,

    depth,

    curl

) {

    const segmentsX =
        20;


    const segmentsY =
        30;


    const positions = [];

    const uvs = [];

    const indices = [];


    for (

        let y = 0;

        y <= segmentsY;

        y++

    ) {

        const v =
            y /
            segmentsY;


        for (

            let x = 0;

            x <= segmentsX;

            x++

        ) {

            const u =

                x /
                segmentsX *
                2 -
                1;


            /*
             * Anchura.
             */

            const baseShape =

                Math.sin(
                    Math.PI * v
                );


            const upperShape =

                0.84 +

                0.16 *
                Math.sin(
                    Math.PI * v
                );


            const widthFactor =

                baseShape *
                upperShape;


            let localWidth =

                u *
                width *
                widthFactor;


            /*
             * Imperfección orgánica.
             */

            localWidth +=

                Math.sin(
                    v *
                    Math.PI *
                    3
                ) *

                0.025 *

                Math.abs(u);


            /*
             * Altura.
             */

            const yPos =
                v *
                height;


            /*
             * Curvatura vertical.
             */

            const verticalCurve =

                Math.pow(
                    v,
                    1.45
                ) *

                curl;


            /*
             * Curvatura lateral.
             */

            const sideCurve =

                Math.pow(
                    Math.abs(u),
                    1.8
                ) *

                depth *
                v;


            /*
             * Curvatura superior.
             */

            const upperCurl =

                Math.pow(
                    v,
                    2.8
                ) *

                0.15;


            const zPos =

                verticalCurve +

                sideCurve +

                upperCurl;


            positions.push(

                localWidth,

                yPos,

                zPos

            );


            uvs.push(

                x /
                segmentsX,

                v

            );

        }

    }


    /*
     * Triángulos.
     */

    for (

        let y = 0;

        y < segmentsY;

        y++

    ) {

        for (

            let x = 0;

            x < segmentsX;

            x++

        ) {

            const a =

                y *
                (segmentsX + 1)
                + x;


            const b =
                a + 1;


            const c =

                a +
                segmentsX +
                1;


            const d =
                c + 1;


            indices.push(

                a,
                c,
                b

            );


            indices.push(

                b,
                c,
                d

            );

        }

    }


    const geometry =
        new THREE.BufferGeometry();


    geometry.setAttribute(

        "position",

        new THREE.Float32BufferAttribute(

            positions,

            3

        )

    );


    geometry.setAttribute(

        "uv",

        new THREE.Float32BufferAttribute(

            uvs,

            2

        )

    );


    geometry.setIndex(
        indices
    );


    geometry.computeVertexNormals();


    return geometry;
}


/* =====================================================
   CREAR PÉTALO
===================================================== */

function createPetal(

    angle,

    radius,

    height,

    width,

    curl,

    material

) {


    const geometry =

        createPetalGeometry(

            width,

            height,

            0.42,

            curl

        );


    const petal =

        new THREE.Mesh(

            geometry,

            material

        );


    petal.rotation.y =
        angle;


    petal.position.set(

        Math.sin(angle) *
        radius,

        height * 0.03,

        Math.cos(angle) *
        radius

    );


    petal.rotation.x =
        0.92;


    petal.rotation.z =

        Math.sin(
            angle * 3
        ) *
        0.035;


    petal.scale.setScalar(
        0.05
    );


    flower.add(
        petal
    );


    return petal;
}


/* =====================================================
   PÉTALOS
===================================================== */

const petals = [];


/* =====================================================
   CAPA EXTERIOR
===================================================== */

const outerCount =
    12;


for (

    let i = 0;

    i < outerCount;

    i++

) {

    const angle =

        (
            i /
            outerCount
        ) *

        Math.PI *
        2;


    const petal =

        createPetal(

            angle,

            0.05,

            2.2,

            1.18,

            0.95,

            petalMaterial

        );


    petal.userData = {

        layer: 0,

        angle,

        delay:
            i * 0.12,

        targetRadius:
            0.90

    };


    petals.push(
        petal
    );
}


/* =====================================================
   CAPA MEDIA
===================================================== */

const middleCount =
    10;


for (

    let i = 0;

    i < middleCount;

    i++

) {

    const angle =

        (
            i /
            middleCount
        ) *

        Math.PI *
        2 +

        Math.PI /
        middleCount;


    const petal =

        createPetal(

            angle,

            0.02,

            2.5,

            0.98,

            0.68,

            innerPetalMaterial

        );


    petal.userData = {

        layer: 1,

        angle,

        delay:
            1.4 +
            i * 0.14,

        targetRadius:
            0.72

    };


    petals.push(
        petal
    );
}


/* =====================================================
   CAPA INTERIOR
===================================================== */

const innerCount =
    8;


for (

    let i = 0;

    i < innerCount;

    i++

) {

    const angle =

        (
            i /
            innerCount
        ) *

        Math.PI *
        2;


    const petal =

        createPetal(

            angle,

            0.01,

            2.75,

            0.72,

            0.42,

            innerPetalMaterial

        );


    petal.userData = {

        layer: 2,

        angle,

        delay:
            2.8 +
            i * 0.17,

        targetRadius:
            0.50

    };


    petals.push(
        petal
    );
}


/* =====================================================
   CENTRO
===================================================== */

const centerGeometry =

    new THREE.SphereGeometry(

        0.30,

        40,

        24

    );


centerGeometry.scale(

    1.15,

    0.28,

    0.9

);


const centerMaterial =

    new THREE.MeshPhysicalMaterial({

        color:
            0xc58b3c,

        roughness:
            0.48,

        metalness:
            0,

        clearcoat:
            0.20,

        sheen:
            0.20

    });


const center =
    new THREE.Mesh(

        centerGeometry,

        centerMaterial

    );


center.position.y =
    2.42;


center.scale.setScalar(
    0.01
);


flower.add(
    center
);


/* =====================================================
   SEMILLAS
===================================================== */

const seedMaterial =

    new THREE.MeshStandardMaterial({

        color:
            0xa86f29,

        roughness:
            0.58

    });


const seeds = [];


for (

    let i = 0;

    i < 18;

    i++

) {

    const seedGeometry =

        new THREE.SphereGeometry(

            0.055,

            12,

            10

        );


    const seed =

        new THREE.Mesh(

            seedGeometry,

            seedMaterial

        );


    const angle =

        Math.random() *
        Math.PI *
        2;


    const radius =

        Math.random() *
        0.25;


    seed.position.set(

        Math.cos(angle) *
        radius,

        2.62 +
        Math.random() *
        0.08,

        Math.sin(angle) *
        radius

    );


    seed.scale.setScalar(
        0.01
    );


    flower.add(
        seed
    );


    seeds.push(
        seed
    );

}


/* =====================================================
   PÉTALOS QUE CAEN
===================================================== */

const fallingPetals = [];


function createFloatingPetal() {

    const geometry =

        createPetalGeometry(

            0.15,

            0.35,

            0.1,

            0.15

        );


    const material =

        new THREE.MeshPhysicalMaterial({

            color:
                0xf3abc4,

            roughness:
                0.42,

            transparent:
                true,

            opacity:
                0.60,

            side:
                THREE.DoubleSide

        });


    const petal =
        new THREE.Mesh(

            geometry,

            material

        );


    petal.position.set(

        (
            Math.random() -
            0.5
        ) * 9,

        Math.random() * 7,

        (
            Math.random() -
            0.5
        ) * 4

    );


    petal.rotation.set(

        Math.random() * 3,

        Math.random() * 3,

        Math.random() * 3

    );


    petal.userData = {

        speed:

            0.004 +
            Math.random() * 0.009,

        rotation:

            (
                Math.random() -
                0.5
            ) * 0.012,

        drift:

            (
                Math.random() -
                0.5
            ) * 0.004,

        phase:

            Math.random() *
            Math.PI *
            2

    };


    scene.add(
        petal
    );


    fallingPetals.push(
        petal
    );
}


for (

    let i = 0;

    i < 18;

    i++

) {

    createFloatingPetal();

}


/* =====================================================
   LUCIÉRNAGAS
===================================================== */

const fireflies = [];


function createFirefly() {

    const geometry =

        new THREE.SphereGeometry(

            0.025,

            8,

            8

        );


    const material =

        new THREE.MeshBasicMaterial({

            color:
                0xffe9a8

        });


    const light =

        new THREE.Mesh(

            geometry,

            material

        );


    light.position.set(

        (
            Math.random() -
            0.5
        ) * 12,

        Math.random() * 7,

        (
            Math.random() -
            0.5
        ) * 5

    );


    light.userData = {

        baseY:
            light.position.y,

        offset:
            Math.random() *
            Math.PI *
            2,

        speed:
            0.3 +
            Math.random() * 0.6

    };


    scene.add(
        light
    );


    fireflies.push(
        light
    );
}


for (

    let i = 0;

    i < 28;

    i++

) {

    createFirefly();

}


/* =====================================================
   TIEMPO
===================================================== */

let startTime =
    performance.now();


let finalStarted =
    false;


/* =====================================================
   EASING
===================================================== */

function easeInOutCubic(t) {

    return t < 0.5

        ? 4 * t * t * t

        : 1 -
          Math.pow(
              -2 * t + 2,
              3
          ) / 2;
}


function easeOutBack(t) {

    const c1 =
        1.70158;


    const c3 =
        c1 + 1;


    return (

        1 +

        c3 *
        Math.pow(
            t - 1,
            3
        ) +

        c1 *
        Math.pow(
            t - 1,
            2
        )

    );
}


/* =====================================================
   ANIMAR FLOR
===================================================== */

function animateFlower(
    elapsed
) {


    /* -----------------------------------------------
       TALLO
    ------------------------------------------------ */

    const stemProgress =
        Math.min(

            elapsed / 3.2,

            1

        );


    stem.scale.y =

        easeInOutCubic(
            stemProgress
        );


    /* -----------------------------------------------
       HOJAS
    ------------------------------------------------ */

    const leafProgress =
        Math.max(

            0,

            Math.min(

                (
                    elapsed -
                    1.7
                ) / 2.5,

                1

            )

        );


    const leafEase =
        easeOutBack(
            leafProgress
        );


    /*
     * Escala de hoja.
     */

    const leftScale =
        0.95 *
        leafEase;


    const rightScale =
        0.90 *
        leafEase;


    leafLeft.scale.set(

        leftScale,

        leftScale,

        leftScale

    );


    leafRight.scale.set(

        rightScale,

        rightScale,

        rightScale

    );


    /*
     * Brisa sutil.
     */

    leafLeft.rotation.z =

        THREE.MathUtils.degToRad(
            -34
        ) +

        Math.sin(
            elapsed * 0.5
        ) *
        0.018;


    leafRight.rotation.z =

        THREE.MathUtils.degToRad(
            34
        ) +

        Math.sin(
            elapsed * 0.48
        ) *
        0.018;


    /* -----------------------------------------------
       PÉTALOS
    ------------------------------------------------ */

    petals.forEach(
        petal => {

            const delay =
                petal.userData.delay;


            let progress =

                (
                    elapsed -
                    1.4 -
                    delay
                ) / 4.2;


            progress =
                Math.max(

                    0,

                    Math.min(
                        progress,
                        1
                    )

                );


            const eased =
                easeInOutCubic(
                    progress
                );


            /*
             * Apertura radial.
             */

            const radius =

                THREE.MathUtils.lerp(

                    0.03,

                    petal.userData
                        .targetRadius,

                    eased

                );


            petal.position.x =

                Math.sin(
                    petal.userData.angle
                ) *
                radius;


            petal.position.z =

                Math.cos(
                    petal.userData.angle
                ) *
                radius;


            /*
             * Apertura.
             */

            const opening =

                THREE.MathUtils.lerp(

                    0.92,

                    0.04,

                    eased

                );


            petal.rotation.x =
                opening;


            /*
             * Escala.
             */

            const scale =

                THREE.MathUtils.lerp(

                    0.05,

                    1,

                    eased

                );


            petal.scale.set(

                scale,

                scale,

                scale

            );


            /*
             * Movimiento natural.
             */

            petal.rotation.z =

                Math.sin(

                    elapsed * 0.65 +
                    petal.userData.angle

                ) *

                0.012;


            petal.rotation.y =

                petal.userData.angle +

                Math.sin(

                    elapsed * 0.35 +
                    petal.userData.angle

                ) *

                0.008;

        }

    );


    /* -----------------------------------------------
       CENTRO
    ------------------------------------------------ */

    const centerProgress =

        Math.max(

            0,

            Math.min(

                (
                    elapsed -
                    6
                ) / 2,

                1

            )

        );


    center.scale.setScalar(

        easeOutBack(
            centerProgress
        )

    );


    /* -----------------------------------------------
       SEMILLAS
    ------------------------------------------------ */

    seeds.forEach(

        seed => {

            const progress =

                Math.max(

                    0,

                    Math.min(

                        (
                            elapsed -
                            6.5
                        ) / 1.5,

                        1

                    )

                );


            seed.scale.setScalar(

                easeOutBack(
                    progress
                )

            );

        }

    );


    /* -----------------------------------------------
       BRISA GENERAL
    ------------------------------------------------ */

    flower.rotation.z =

        Math.sin(
            elapsed * 0.45
        ) *

        0.010;


    flower.rotation.x =

        Math.sin(
            elapsed * 0.35
        ) *

        0.005;


    /*
     * Respiración mínima.
     */

    const breathing =

        1 +

        Math.sin(
            elapsed * 0.7
        ) *

        0.008;


    flower.scale.x =
        0.90 * breathing;


    flower.scale.z =
        0.90 * breathing;

}


/* =====================================================
   PÉTALOS FLOTANTES
===================================================== */

function animateFallingPetals(
    elapsed
) {

    fallingPetals.forEach(

        petal => {

            petal.position.y -=
                petal.userData.speed;


            petal.position.x +=
                petal.userData.drift;


            petal.rotation.x +=
                petal.userData.rotation;


            petal.rotation.z +=
                petal.userData.rotation *
                0.7;


            petal.position.x +=

                Math.sin(

                    elapsed * 0.5 +
                    petal.userData.phase

                ) *

                0.0015;


            if (
                petal.position.y <
                -5
            ) {

                petal.position.y =
                    7;


                petal.position.x =

                    (
                        Math.random() -
                        0.5
                    ) * 9;

            }

        }

    );

}


/* =====================================================
   LUCIÉRNAGAS
===================================================== */

function animateFireflies(
    time
) {

    fireflies.forEach(

        light => {

            const data =
                light.userData;


            light.position.y =

                data.baseY +

                Math.sin(

                    time *
                    data.speed +
                    data.offset

                ) *

                0.35;


            const glow =

                (
                    Math.sin(

                        time *
                        data.speed *
                        2 +
                        data.offset

                    ) + 1

                ) / 2;


            light.scale.setScalar(

                0.5 +
                glow * 1.5

            );

        }

    );

}


/* =====================================================
   CÁMARA
===================================================== */

function animateCamera(
    elapsed
) {

    const targetX =

        Math.sin(
            elapsed * 0.18
        ) *

        0.08;


    const targetY =

        2.3 +

        Math.sin(
            elapsed * 0.25
        ) *

        0.02;


    camera.position.x +=

        (
            targetX -
            camera.position.x
        ) *

        0.015;


    camera.position.y +=

        (
            targetY -
            camera.position.y
        ) *

        0.015;


    camera.lookAt(

        0,

        2.1,

        0

    );

}


/* =====================================================
   MENSAJE FINAL
===================================================== */

function showFinalMessage() {

    const message =
        document.querySelector(
            ".message"
        );


    const finalMessage =
        document.querySelector(
            ".final-message"
        );


    const restart =
        document.getElementById(
            "restart"
        );


    if (message) {

        message.classList.remove(
            "show"
        );

    }


    setTimeout(

        () => {

            if (finalMessage) {

                finalMessage.classList.add(
                    "show"
                );

            }


            if (restart) {

                restart.classList.add(
                    "show"
                );

            }

        },

        1300

    );

}


/* =====================================================
   ANIMACIÓN PRINCIPAL
===================================================== */

function animate() {

    requestAnimationFrame(
        animate
    );


    const now =
        performance.now();


    const elapsed =

        (
            now -
            startTime
        ) / 1000;


    animateFlower(
        elapsed
    );


    animateFallingPetals(
        elapsed
    );


    animateFireflies(
        elapsed
    );


    animateCamera(
        elapsed
    );


    /* -----------------------------------------------
       MENSAJE
    ------------------------------------------------ */

    const message =
        document.querySelector(
            ".message"
        );


    if (

        elapsed > 3.5 &&

        elapsed < 11

    ) {

        if (message) {

            message.classList.add(
                "show"
            );

        }

    }


    /* -----------------------------------------------
       FINAL
    ------------------------------------------------ */

    if (

        elapsed > 12 &&

        !finalStarted

    ) {

        finalStarted =
            true;


        showFinalMessage();

    }


    renderer.render(
        scene,
        camera
    );

}


/* =====================================================
   LOADING
===================================================== */

setTimeout(

    () => {

        const loading =
            document.querySelector(
                ".loading"
            );


        if (!loading) {

            return;

        }


        loading.style.opacity =
            "0";


        setTimeout(

            () => {

                loading.remove();

            },

            1300

        );

    },

    800

);


/* =====================================================
   INICIAR
===================================================== */

animate();


/* =====================================================
   REINICIAR
===================================================== */

const restart =
    document.getElementById(
        "restart"
    );


if (restart) {

    restart.addEventListener(

        "click",

        () => {

            location.reload();

        }

    );

}


/* =====================================================
   REDIMENSIONAR
===================================================== */

window.addEventListener(

    "resize",

    () => {

        camera.aspect =

            window.innerWidth /
            window.innerHeight;


        camera.updateProjectionMatrix();


        renderer.setSize(

            window.innerWidth,

            window.innerHeight

        );


        renderer.setPixelRatio(

            Math.min(

                window.devicePixelRatio,

                2

            )

        );

    }

);


/* =====================================================
   PÉTALOS DECORATIVOS
===================================================== */

function createDecorativePetals() {

    for (

        let i = 0;

        i < 5;

        i++

    ) {

        const petal =
            document.createElement(
                "div"
            );


        petal.className =
            "decorative-petal";


        petal.style.left =
            `${8 + i * 18}%`;


        petal.style.animationDelay =
            `${-i * 2.3}s`;


        petal.style.animationDuration =
            `${11 + i * 1.4}s`;


        document.body.appendChild(
            petal
        );

    }

}


createDecorativePetals();


/* =====================================================
   DESTELLOS
===================================================== */

function createLightOrbs() {

    for (

        let i = 0;

        i < 8;

        i++

    ) {

        const orb =
            document.createElement(
                "div"
            );


        orb.className =
            "light-orb";


        orb.style.left =
            `${5 + Math.random() * 90}%`;


        orb.style.top =
            `${10 + Math.random() * 75}%`;


        orb.style.animationDelay =
            `${Math.random() * 5}s`;


        document.body.appendChild(
            orb
        );

    }

}


createLightOrbs();