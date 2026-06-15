#!/usr/bin/env bash
set -e

# checkout-opensource.sh
# Checks out all the open source projects in the sibling opensource directory
# using the exact remote URLs and commits of the current workspace setup.

# Resolve the target opensource directory relative to this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENSOURCE_DIR="${SCRIPT_DIR}/../../opensource"

echo "Ensuring opensource directory exists at: ${OPENSOURCE_DIR}"
mkdir -p "${OPENSOURCE_DIR}"
OPENSOURCE_DIR="$(cd "${OPENSOURCE_DIR}" && pwd)"

checkout_repo() {
    local name="$1"
    local url="$2"
    local ref="$3"
    
    echo "--------------------------------------------------"
    echo "Processing ${name}..."
    local target_dir="${OPENSOURCE_DIR}/${name}"
    
    if [ ! -d "${target_dir}" ]; then
        echo "Cloning ${name} from ${url}..."
        git clone "${url}" "${target_dir}"
    else
        echo "Directory ${name} already exists."
        # Update the remote URL if it changed
        git -C "${target_dir}" remote set-url origin "${url}"
    fi
    
    echo "Checking out commit/branch ${ref} in ${name}..."
    git -C "${target_dir}" fetch origin
    git -C "${target_dir}" checkout "${ref}"
}

checkout_repo "Clipper2" "https://github.com/AngusJohnson/Clipper2.git" "21ebba05db8894f0c7217ad35ea518080f324946"
checkout_repo "FreeCAD" "https://github.com/FreeCAD/FreeCAD.git" "0108fd4b4850cc46e625b60e53cea7a7bbe69f8d"
checkout_repo "OCCT" "https://github.com/Open-Cascade-SAS/OCCT.git" "d3056ef80c9668f395da40f5fd7be186cae4501f"
checkout_repo "blender" "https://projects.blender.org/blender/blender.git" "ec6e62d40fa9e9d1bea33ad5d00148c99a4f0832"
checkout_repo "blendercam" "https://github.com/vilemduha/blendercam" "ae5ab17ed7db880a389749c06f7e7aad48b96939"
checkout_repo "diff-cam" "git@github.com:nathantsoi/diff-cam.git" "baaebb053545afb4d008d67105ef60f2ed59f17f"
checkout_repo "gcad3d" "https://github.com/gcad3d/gcad3d.git" "168fcdb281948d00866f46e1635492ce1c61f80d"
checkout_repo "klipper" "https://github.com/Klipper3d/klipper.git" "c707dd19214709dc23684b254a68e3bf69e4cfb3"
checkout_repo "linuxcnc" "https://github.com/LinuxCNC/linuxcnc.git" "39bfc1874ac41eb9dd3088fe802dd1726fb68652"
checkout_repo "mayo" "https://github.com/fougue/mayo.git" "614755f441a63c905fc78d834aa52dfd802431a2"
checkout_repo "meshmill" "https://github.com/jes/meshmill.git" "8f4f91787804fc94a8c619858d193c262908e4e9"
checkout_repo "opencamlib" "https://github.com/aewallin/opencamlib.git" "009171045b1fe8fa328e376e26e4542d2197c0d3"
checkout_repo "openscad" "https://github.com/openscad/openscad.git" "41f58fe57c03457a3a8b4dc541ef5654ec3e8c78"
checkout_repo "openvoronoi" "https://github.com/aewallin/openvoronoi.git" "d13948d7f84530d18e81e9b34c9584b09b740515"

echo "--------------------------------------------------"
echo "All open source projects checked out successfully!"
