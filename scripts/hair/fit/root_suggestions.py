"""Non-destructive candidate hair-root detection from isolated UV ribbons.

Input: donor vertices/UVs and author-approved real scalp points, all in the
SAME coordinate units. Output: suggested root weights and QA reasons; no fit
is applied. Accepted roots MUST be reviewed on real character before export.
"""
from __future__ import annotations
import numpy as np


def suggest_uv_roots(points, uvs, islands, scalp_points, *,
                     max_root_distance, min_end_separation,
                     influence_fraction=0.28, min_uv_span=0.02):
    xyz=np.asarray(points,dtype=np.float64)
    uv=np.asarray(uvs,dtype=np.float64)
    scalp=np.asarray(scalp_points,dtype=np.float64)
    if xyz.ndim!=2 or xyz.shape[1]!=3 or uv.shape!=(len(xyz),2):
        raise ValueError('Expected Nx3 donor points and matching Nx2 UVs')
    if scalp.ndim!=2 or scalp.shape[1]!=3 or not len(scalp):
        raise ValueError('Provide nonempty author-approved scalp XYZ vertices')
    if any(not np.isfinite(a).all() for a in (xyz,uv,scalp)):
        raise ValueError('Nonfinite geometry/UV/scalp coordinates')
    if not (max_root_distance>0 and min_end_separation>0 and 0<influence_fraction<0.5):
        raise ValueError('Invalid suggestion limits')
    weight=np.zeros(len(xyz),dtype=np.float64)
    seen=np.zeros(len(xyz),dtype=np.int8)
    records=[]
    for group_id,group in enumerate(islands):
        idx=np.asarray(group,dtype=np.int32)
        if not len(idx):continue
        if np.any(idx<0) or np.any(idx>=len(xyz)) or np.any(seen[idx]):
            raise ValueError('Island vertex indices invalid or overlapping')
        seen[idx]=1
        coords=xyz[idx];texture=uv[idx]
        widths=np.ptp(texture,axis=0)
        choices=[]
        for axis in (0,1):
            if widths[axis]<=min_uv_span:continue
            t=(texture[:,axis]-texture[:,axis].min())/widths[axis]
            for end in (0,1):
                select=(t<=.14) if end==0 else (t>=.86)
                if int(select.sum())<2:continue
                centroid=np.median(coords[select],axis=0)
                distances=np.linalg.norm(scalp-centroid[None,:],axis=1)
                nearest=int(distances.argmin())
                choices.append(dict(axis=axis,end=end,distance=float(distances[nearest]),
                                    closest_scalp_id=nearest,centroid=centroid,
                                    marked_verts=int(select.sum())))
        entry={'island':group_id,'size':int(len(idx)),'status':'REVIEW'}
        if not choices:
            entry['reason']='no reliable UV end';records.append(entry);continue
        choices.sort(key=lambda x:x['distance'])
        candidate=choices[0]
        counterpart=next((c for c in choices if c['axis']==candidate['axis'] and c['end']!=candidate['end']),None)
        entry.update({'axis':candidate['axis'],'end':candidate['end'],
                      'root_distance':candidate['distance'],
                      'root_center':candidate['centroid'].tolist(),
                      'closest_scalp_id':candidate['closest_scalp_id']})
        if counterpart is None or counterpart['distance']-candidate['distance']<min_end_separation:
            entry['reason']='UV root direction ambiguous'
        elif candidate['distance']>max_root_distance:
            entry['reason']='candidate root too far from original scalp'
        else:
            t=(texture[:,candidate['axis']]-texture[:,candidate['axis']].min())/widths[candidate['axis']]
            if candidate['end']==1:t=1.-t
            influence=np.where(t<influence_fraction,np.square(np.maximum(0.,1.-t/influence_fraction)),0.)
            if (influence>0).sum()>len(idx)*.6:
                entry['reason']='root influence covers too much of ribbon'
            else:
                weight[idx]=influence
                entry['status']='ROOT_SUGGESTED_NOT_APPROVED'
                entry['weighted_vertices']=int((influence>0).sum())
                entry['protected_tip_vertices']=int((influence==0).sum())
        records.append(entry)
    return weight,records
