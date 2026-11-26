"""Run the matched 24-frame Vesper collar stress loop through the private pose harness."""
from pathlib import Path
import sys
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parent))
import review_curly_pose_clearance as review

def main():
    base_expression=review.stress_expression

    def mixed_expression(points,expression):
        if "@" not in expression:
            return base_expression(points,expression)
        name,factor=expression.split("@")
        return points+(base_expression(points,name)-points)*float(factor)

    review.stress_expression=mixed_expression
    frames=[]
    for i in range(24):
        phase=2*np.pi*i/24
        yaw=36*np.sin(phase)
        pitch=13*max(0,-np.cos(phase))
        roll=3*np.sin(phase)
        smile=max(0,np.sin(phase))
        puff=max(0,-np.sin(phase))
        expression=f"smile@{smile}" if smile>=puff else f"cheek-puff@{puff}"
        frames.append((f"turn-{i:02d}",yaw,pitch,roll,expression,"high",(.26,-1,.11)))
    review.PREVIEWS=tuple(frames)
    review.main()

if __name__ == "__main__":
    main()
