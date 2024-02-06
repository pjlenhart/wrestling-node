const express = require('express');

const testRouter: any = express.Router();

testRouter.get('/', (req: Request & { chimp: string }, res) => {
    console.log(process.env.MYVAR);
    res.status(200).send({ env: process.env.MYVAR, chimp: req.chimp });
});

export default testRouter;
