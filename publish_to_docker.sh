
# build for current single arch platform
# docker build -t kikoeru .
# docker tag kikoeru number17/kikoeru
# docker push number17/kikoeru


# build for multiple arch platform
# ref: https://zhuanlan.zhihu.com/p/622399482

# first time use must create a custom builder for differnet arch target
# docker buildx create --name mybuilder
# docker buildx use mybuilder
# docker buildx inspect --bootstrap mybuilder
# docker buildx ls

# 正式版本更新
# docker buildx build --platform linux/arm64,linux/amd64,linux/arm/v7 -t number17/kikoeru . --push

# 打包ai相关功能更新
docker buildx build --platform linux/arm64,linux/amd64,linux/arm/v7 -t number17/kikoeru:ai-translater-ui . --push
