# Match the assets uploaded by manual-deploy.sh. Never hash our own output.
file(GLOB WEB_ASSETS RELATIVE "${WEB_OUTPUT_DIR}"
    "${WEB_OUTPUT_DIR}/*.mjs" "${WEB_OUTPUT_DIR}/*.css"
    "${WEB_OUTPUT_DIR}/*.wasm" "${WEB_OUTPUT_DIR}/*.wasm.map"
    "${WEB_OUTPUT_DIR}/*.ico" "${WEB_OUTPUT_DIR}/*.png"
    "${WEB_OUTPUT_DIR}/*.js" "${WEB_OUTPUT_DIR}/*.html"
    "${WEB_OUTPUT_DIR}/manifest.json"
)
list(REMOVE_ITEM WEB_ASSETS "index.sw.js")
list(SORT WEB_ASSETS)

# Include the worker itself so changes to its behavior also change VERSION.
file(SHA256 "${SERVICE_WORKER_TEMPLATE}" WEB_CONTENT_HASHES)
string(APPEND WEB_CONTENT_HASHES "\nWEB_DEBUG_BUILD:${WEB_DEBUG_BUILD}")
foreach(asset IN LISTS WEB_ASSETS)
    file(SHA256 "${WEB_OUTPUT_DIR}/${asset}" ASSET_HASH)
    string(APPEND WEB_CONTENT_HASHES "\n${asset}:${ASSET_HASH}")
endforeach()
string(SHA256 WEB_ASSET_VERSION "${WEB_CONTENT_HASHES}")

configure_file("${SERVICE_WORKER_TEMPLATE}" "${WEB_OUTPUT_DIR}/index.sw.js" @ONLY)
