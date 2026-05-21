from setuptools import setup, find_packages

setup(
    name="aim3d",
    version="0.1.0",
    description="Two-Tiered API for aim3d CAD/CAM engine (aim3d & adsk)",
    author="aim3d Core Team",
    packages=find_packages(where="."),
    package_dir={"": "."},
    install_requires=[
        "numpy>=1.20.0",
    ],
    extras_require={
        "test": ["pytest>=6.0.0"],
    },
    python_requires=">=3.9",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
)
