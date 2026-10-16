/* libzero_transport.so — Zero-Transport Shared-Memory Pipeline */
#ifndef ZERO_TRANSPORT_H
#define ZERO_TRANSPORT_H

#include <stdint.h>
#include <stdbool.h>

#define ZT_RING_BYTES 65536UL
#define ZT_MAGIC     0x594F5445ULL

typedef struct __attribute__((aligned(64))) {
    uint64_t record_hdr;
    uint64_t magic_opcode;
    uint64_t entity_id;
    uint32_t payload_len;
    uint32_t capability_bit;
    uint8_t  payload[32];
} ZeroPolicyFrame;

typedef struct {
    int      fd;
    void    *vbase;
    void    *ring;
    size_t   ring_bytes;
} ZtHandle;

ZtHandle *zt_alloc(int ring_bytes);
void zt_free(ZtHandle *h);
int zt_push(ZtHandle *h, const void *payload, uint32_t payload_len,
            uint64_t entity_id, uint32_t capability_bit);
int zt_pop(ZtHandle *h, void *out, uint32_t out_cap,
           uint64_t *entity_id, uint32_t *capability_bit);
int zt_get_fd(const ZtHandle *h);
size_t zt_ring_bytes(const ZtHandle *h);
bool zt_verify(const ZeroPolicyFrame *f, uint64_t allowed_bitmap);

#endif
