const testMiddleware = (req, res, next) => {
    req.chimp = 'chimp';
    next();
};

export default testMiddleware;
