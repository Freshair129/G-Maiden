#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <vpx/vpx_decoder.h>
#include <vpx/vp8dx.h>

typedef struct { vpx_codec_ctx_t codec; } GannDecoder;
typedef struct { const uint8_t *planes[3]; size_t strides[3]; } GannImage;

void *gann_vpx_new(int vp9) {
    GannDecoder *decoder = calloc(1, sizeof(*decoder));
    if (!decoder) return NULL;
    vpx_codec_dec_cfg_t config = { 1, 0, 0 };
    if (vpx_codec_dec_init(&decoder->codec, vp9 ? vpx_codec_vp9_dx() : vpx_codec_vp8_dx(), &config, 0) != VPX_CODEC_OK) {
        free(decoder); return NULL;
    }
    return decoder;
}
int gann_vpx_decode(void *opaque, const uint8_t *bytes, size_t len, unsigned width, unsigned height, GannImage *out) {
    GannDecoder *decoder = opaque;
    if (len > UINT32_MAX || vpx_codec_decode(&decoder->codec, bytes, (unsigned)len, NULL, 0) != VPX_CODEC_OK) return -1;
    vpx_codec_iter_t iter = NULL;
    vpx_image_t *frame = vpx_codec_get_frame(&decoder->codec, &iter);
    if (!frame || frame->fmt != VPX_IMG_FMT_I420 || frame->d_w != width || frame->d_h != height) return -2;
    for (int n = 0; n < 3; ++n) {
        size_t min_stride = n == 0 ? width : (width + 1) / 2;
        if (!frame->planes[n] || frame->stride[n] <= 0 || (size_t)frame->stride[n] < min_stride || (size_t)frame->stride[n] > min_stride + 4096) return -3;
        out->planes[n] = frame->planes[n]; out->strides[n] = (size_t)frame->stride[n];
    }
    if (vpx_codec_get_frame(&decoder->codec, &iter) != NULL) return -4;
    return 0;
}
void gann_vpx_free(void *opaque) {
    if (opaque) { GannDecoder *decoder = opaque; vpx_codec_destroy(&decoder->codec); free(decoder); }
}
