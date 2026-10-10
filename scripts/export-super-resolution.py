"""Convert the official Real-ESRGAN AnimeVideo-v3 weights without executing pickle code.

Requires numpy and onnx. Downloads are performed separately; only the supplied
local checkpoint is read. Architecture: upstream SRVGGNetCompact, 16 PReLU
convolutions, 4x pixel shuffle and nearest-neighbor residual.
"""
import collections
import hashlib
import io
import pickle
import sys
import zipfile
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper


def tensor(storage, offset, shape, stride, *unused):
    expected = tuple(np.cumprod((1,) + tuple(reversed(shape[1:])), dtype=int)[::-1])
    if tuple(stride) != expected:
        raise ValueError('Non-contiguous checkpoint tensor')
    return storage[offset:offset + int(np.prod(shape))].reshape(shape).copy()


class WeightReader(pickle.Unpickler):
    def find_class(self, module, name):
        allowed = {('collections', 'OrderedDict'): collections.OrderedDict,
                   ('torch._utils', '_rebuild_tensor_v2'): tensor,
                   ('torch', 'FloatStorage'): 'float32'}
        if (module, name) not in allowed:
            raise ValueError(f'Unsupported checkpoint object: {module}.{name}')
        return allowed[(module, name)]

    def persistent_load(self, value):
        kind, dtype, key, device, count = value
        if kind != 'storage' or dtype != 'float32':
            raise ValueError('Unsupported checkpoint storage')
        data = archive.read(f'{root}/data/{key}')
        if len(data) != count * 4:
            raise ValueError('Incomplete checkpoint tensor')
        return np.frombuffer(data, dtype='<f4')


checkpoint, output = map(Path, sys.argv[1:3])
with zipfile.ZipFile(checkpoint) as archive:
    pickled = next(name for name in archive.namelist() if name.endswith('/data.pkl'))
    root = pickled.rsplit('/', 1)[0]
    loaded = WeightReader(io.BytesIO(archive.read(pickled))).load()
weights = loaded.get('params_ema', loaded.get('params'))
if weights is None or len(weights) != 53:
    raise ValueError('Expected official 16-convolution SRVGG checkpoint')
initializers = []
nodes = []
current = 'input'
for index in range(35):
    key = f'body.{index}.weight'
    values = weights[key]
    if index % 2 == 0:
        bias = f'body.{index}.bias'
        nodes.append(helper.make_node('Conv', [current, key, bias], [f'layer{index}'], pads=[1, 1, 1, 1]))
        initializers.append(numpy_helper.from_array(weights[bias], bias))
    else:
        values = values.reshape(-1, 1, 1)
        nodes.append(helper.make_node('PRelu', [current, key], [f'layer{index}']))
    initializers.append(numpy_helper.from_array(values, key))
    current = f'layer{index}'
nodes.append(helper.make_node('DepthToSpace', [current], ['residual'], blocksize=4, mode='CRD'))
initializers.append(numpy_helper.from_array(np.array([1, 1, 4, 4], dtype=np.float32), 'scales'))
nodes.append(helper.make_node('Resize', ['input', '', 'scales'], ['base'], mode='nearest', coordinate_transformation_mode='asymmetric', nearest_mode='floor'))
nodes.append(helper.make_node('Add', ['residual', 'base'], ['output']))
graph = helper.make_graph(nodes, 'RealESRGAN-AnimeVideo-v3',
    [helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 3, 'height', 'width'])],
    [helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 3, 'out_height', 'out_width'])], initializers)
model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', 13)], producer_name='PRISM official checkpoint conversion')
model.ir_version = 8
onnx.checker.check_model(model)
onnx.save(model, output)
print({'checkpoint_sha256': hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
       'onnx_sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'bytes': output.stat().st_size})
