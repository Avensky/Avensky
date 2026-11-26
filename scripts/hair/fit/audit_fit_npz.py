"""Offline exact-triangle QA of private Blender geometry probes (READ-ONLY).

Requires numpy/scipy in the normal system Python, not in Blender's embedded
Python. Does not infer a root/correct geometry/verify opacity or animation.
Store NPZ/CSV/JSON OUTSIDE any public GitHub working tree.

Example:
 python scripts/hair/fit/audit_fit_npz.py --input /private/curly/after.npz \
   --baseline /private/curly/before.npz --out-dir /private/curly/contact-audit
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
from pathlib import Path
import numpy as np
from surface_fit_metrics import measure_nearest_surface, summarize_contact


def hash_sha256(path):
    d=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):
            d.update(b)
    return d.hexdigest()


def read_probe(path):
    if path.suffix.lower()!='.npz' or not path.is_file():
        raise ValueError('Expected an existing PRIVATE .npz evidence file')
    with np.load(path,allow_pickle=False) as d:
        keys=('scalp_vertices','scalp_triangles','roots_xyz','root_island_ids','meters_per_unit')
        if any(k not in d for k in keys):
            raise ValueError('Missing probe keys: '+str([k for k in keys if k not in d]))
        result={k:d[k].copy() for k in keys}
    if not np.issubdtype(result['root_island_ids'].dtype,np.integer):
        raise ValueError('root island IDs must be integers')
    if result['root_island_ids'].shape != (len(result['roots_xyz']),):
        raise ValueError('Root/island correspondence incomplete')
    if len(set(map(int,result['root_island_ids'])))!=len(result['root_island_ids']):
        raise ValueError('Duplicate root candidate ID')
    unit=result['meters_per_unit']
    if unit.size!=1:raise ValueError('Expected scalar meters_per_unit')
    result['meters_per_unit']=float(unit)
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input',required=True,type=Path)
    p.add_argument('--baseline',type=Path)
    p.add_argument('--out-dir',required=True,type=Path)
    p.add_argument('--root-gap-warning-mm',default=20.,type=float)
    p.add_argument('--penetration-warning-mm',default=-2.,type=float)
    a=p.parse_args()
    current=read_probe(a.input)
    previous=read_probe(a.baseline) if a.baseline else None
    if previous is not None:
        for k in ('scalp_vertices','scalp_triangles','root_island_ids'):
            if not np.array_equal(current[k],previous[k]):
                raise ValueError('Different scalp or root IDs between probes; compare the SAME character and donor')
        if current['meters_per_unit']!=previous['meters_per_unit']:
            raise ValueError('Different physical-unit conversion between probes')
    if a.out_dir.exists():
        raise FileExistsError('Choose a NEW private output folder; never overwrite prior QA evidence')
    if not (a.root_gap_warning_mm>0 and a.penetration_warning_mm<0):
        raise ValueError('Root-gap warning must be positive, penetration limit negative')
    a.out_dir.mkdir(parents=True)
    def measure(d):
        values=measure_nearest_surface(d['roots_xyz'],d['scalp_vertices'],d['scalp_triangles'],
                                       meters_per_unit=d['meters_per_unit'])
        return values,summarize_contact(values,max_root_gap_mm=a.root_gap_warning_mm,
                                        min_root_offset_mm=a.penetration_warning_mm)
    after_rows, after=measure(current)
    before_rows,before=measure(previous) if previous is not None else (None,None)
    table=[]
    for i,r in enumerate(after_rows):
        entry={'curl_component':int(current['root_island_ids'][i]),
               'triangle_index':r['triangle_index'],
               'distance_mm':round(r['distance_mm'],5),
               'local_normal_offset_mm':round(r['local_normal_offset_mm'],5),
               'root_gap_warning':r['distance_mm']>a.root_gap_warning_mm,
               'possible_penetration_warning':r['local_normal_offset_mm']<a.penetration_warning_mm}
        if before_rows:
            entry['baseline_distance_mm']=round(before_rows[i]['distance_mm'],5)
            entry['change_in_distance_mm']=round(r['distance_mm']-before_rows[i]['distance_mm'],5)
        table.append(entry)
    report={'kind':'ORIGINAL_FACE4_EXACT_TRIANGLE_CONTACT_AUDIT',
            'status':'REVIEW_ONLY_NOT_ALPHA_COVERAGE_OR_COLLISION_VERIFICATION',
            'candidate_root_count':len(after_rows),
            'head_triangle_count':len(current['scalp_triangles']),
            'after':after,'before':before,
            'input_sha256':hash_sha256(a.input),
            'baseline_sha256':hash_sha256(a.baseline) if a.baseline else None,
            'root_gap_warning_mm':a.root_gap_warning_mm,
            'penetration_warning_mm':a.penetration_warning_mm,
            'qa_required':['original scalp region artist approval','true root orientation',
                           'hair opacity/alpha six-view coverage','rig/pose','mobile performance'],
            'mesh_edited':False,'release_approved':False}
    (a.out_dir/'contact_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    with (a.out_dir/'contact_by_curl.csv').open('w',newline='',encoding='utf-8') as f:
        writer=csv.DictWriter(f,fieldnames=list(table[0]))
        writer.writeheader();writer.writerows(table)
    print(json.dumps({'report':str(a.out_dir/'contact_report.json'),
                      'median_after_mm':after['median_distance_mm'],
                      'gap_warnings':after['candidates_over_gap_limit'],
                      'possible_penetrations':after['possible_surface_penetrations'],
                      'status':report['status']},indent=2))


if __name__=='__main__':main()
