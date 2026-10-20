"""Bounded CPU preparation and adaptive batches for the Score worker."""
from pass_resources import native_thread_count, prepare_workers
from pass_resources import native_thread_limits as native_thread_limits


def score_plan(cpu_count, cuda=False, free_bytes=0):
    cpus = max(1, cpu_count or 1)
    batch = 1
    if cuda:
        for size in (8, 4, 2):
            if free_bytes >= size * 1024 ** 3:
                batch = size
                break
    workers = prepare_workers(cpus) if cuda else 1
    return {
        'device': 'cuda' if cuda else 'cpu',
        'prepare_workers': workers,
        'torch_threads': 1 if cuda else native_thread_count(cpus),
        'native_threads': native_thread_count(cpus),
        'batch_size': batch,
        'prefetch': max(workers * 2, batch * 2),
    }


def predict_batch(entries, torch, clip_model, aes_head, nsfw_bundle, device, reason):
    """Return CPU results in input order. A failed head keeps its CLIP result."""
    predictions = [{'error': prep['error'], 'heads': {}, 'aesthetic': None, 'nsfw': None}
                   for _, prep in entries]
    valid = [i for i, (_, prep) in enumerate(entries) if prep['error'] is None]
    if not valid:
        return predictions
    with torch.no_grad():
        inputs = torch.stack([entries[i][1]['clip'] for i in valid]).to(device)
        embeddings = clip_model.encode_image(inputs)
        embeddings = embeddings / embeddings.norm(dim=-1, keepdim=True)
        vectors = embeddings.cpu().numpy().astype('float32')
        for offset, index in enumerate(valid):
            predictions[index]['embedding'] = vectors[offset]
        if aes_head is not None:
            try:
                scores = aes_head(embeddings).flatten().cpu().tolist()
                for offset, index in enumerate(valid):
                    predictions[index]['aesthetic'] = round(float(scores[offset]), 3)
            except Exception as exc:
                if isinstance(exc, torch.cuda.OutOfMemoryError) or len(valid) > 1:
                    raise
                predictions[valid[0]]['heads']['aesthetic'] = reason(exc)
        if nsfw_bundle is not None:
            model, _, nsfw_index = nsfw_bundle
            nsfw_valid = []
            for index in valid:
                prep = entries[index][1]
                if prep['nsfw_error'] is not None:
                    predictions[index]['heads']['nsfw'] = reason(prep['nsfw_error'])
                else:
                    nsfw_valid.append(index)
            if nsfw_valid:
                try:
                    first = entries[nsfw_valid[0]][1]['nsfw']
                    inputs = {key: torch.cat([entries[i][1]['nsfw'][key] for i in nsfw_valid], dim=0).to(device)
                              for key in first}
                    logits = model(**inputs).logits
                    scores = torch.softmax(logits, dim=-1)[:, nsfw_index].cpu().tolist()
                    for offset, index in enumerate(nsfw_valid):
                        predictions[index]['nsfw'] = round(float(scores[offset]), 4)
                except Exception as exc:
                    if isinstance(exc, torch.cuda.OutOfMemoryError) or len(nsfw_valid) > 1:
                        raise
                    predictions[nsfw_valid[0]]['heads']['nsfw'] = reason(exc)
    return predictions


def predict_adaptive(entries, plan, torch, clip_model, aes_head, nsfw_bundle, reason, log):
    """Retry smaller batches on OOM; isolate other failures to one image."""
    results = []
    offset = 0
    while offset < len(entries):
        size = min(plan['batch_size'], len(entries) - offset)
        part = entries[offset:offset + size]
        oom = False
        failure = None
        try:
            predicted = predict_batch(part, torch, clip_model, aes_head, nsfw_bundle,
                                      plan['device'], reason)
        except torch.cuda.OutOfMemoryError as exc:
            oom = True
            failure = reason(exc)
        except Exception as exc:
            failure = reason(exc)
        # Leave the exception scope before releasing cached GPU blocks: the
        # traceback otherwise retains the failed batch's tensors.
        if failure is not None:
            if oom:
                torch.cuda.empty_cache()
            if size > 1:
                plan['batch_size'] = max(1, size // 2) if oom else 1
                log(f"[phase] scoring on CUDA: batch {plan['batch_size']} "
                    + ('after GPU memory pressure' if oom else 'to isolate an inference failure'))
                continue
            predicted = [{'error': RuntimeError(failure), 'heads': {}, 'aesthetic': None, 'nsfw': None}]
        results.extend(predicted)
        offset += size
    return results
