// Package herd documents the root of the herd module.
//
// The runnable entrypoints live in cmd/ (herd-launcher, herd-plane,
// fake-model, ...). This package intentionally carries no main function
// and no tests; it exists so the module root stays a coherent package
// for go tooling (go build ./... / go test ./...).
package herd
